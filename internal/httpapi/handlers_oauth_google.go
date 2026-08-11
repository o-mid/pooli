package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/auth"
	"golang.org/x/oauth2"
)

const oauthStateTTL = 10 * time.Minute

// Google OAuth2 endpoints (avoid pulling cloud.google.com via oauth2/google).
var googleOAuthEndpoint = oauth2.Endpoint{
	AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
	TokenURL: "https://oauth2.googleapis.com/token",
}

func (s *Server) googleOAuthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.Cfg.GoogleClientID,
		ClientSecret: s.Cfg.GoogleClientSecret,
		RedirectURL:  s.Cfg.GoogleRedirectURL,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     googleOAuthEndpoint,
	}
}

func (s *Server) handleGoogleAuthProviders(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"google": s.Cfg.GoogleOAuthEnabled(),
		"email":  true,
		"phone":  s.Cfg.PhoneOTPEnabled(),
	})
}

func (s *Server) handleGoogleAuthStart(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.GoogleOAuthEnabled() {
		s.redirectAuthError(w, r, "google_not_configured")
		return
	}
	state, err := auth.NewOAuthState(s.Cfg.SessionSecret, oauthStateTTL)
	if err != nil {
		log.Printf("oauth_google stage=start_failed")
		s.redirectAuthError(w, r, "google_start_failed")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.OAuthStateCookie,
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookie(s.Cfg),
		MaxAge:   int(oauthStateTTL.Seconds()),
	})
	authURL := s.googleOAuthConfig().AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.SetAuthURLParam("prompt", "select_account"))
	log.Printf("oauth_google stage=start_ok redirect_uri=%s", s.Cfg.GoogleRedirectURL)
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *Server) handleGoogleAuthCallback(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.GoogleOAuthEnabled() {
		s.redirectAuthError(w, r, "google_not_configured")
		return
	}
	if errMsg := r.URL.Query().Get("error"); errMsg != "" {
		log.Printf("oauth_google stage=google_callback_error provider_error=%s", sanitizeOAuthErr(errMsg))
		s.redirectAuthError(w, r, "google_callback_error")
		return
	}
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		log.Printf("oauth_google stage=google_invalid_callback missing_code=%t missing_state=%t", code == "", state == "")
		s.redirectAuthError(w, r, "google_invalid_callback")
		return
	}

	c, err := r.Cookie(auth.OAuthStateCookie)
	if err != nil || c.Value == "" {
		log.Printf("oauth_google stage=google_state_cookie_missing")
		s.redirectAuthError(w, r, "google_state_cookie_missing")
		return
	}
	if c.Value != state {
		log.Printf("oauth_google stage=google_state_mismatch")
		s.redirectAuthError(w, r, "google_state_mismatch")
		return
	}
	if err := auth.ValidateOAuthState(s.Cfg.SessionSecret, state); err != nil {
		log.Printf("oauth_google stage=google_state_invalid")
		s.redirectAuthError(w, r, "google_state_invalid")
		return
	}
	// Clear one-time state cookie
	http.SetCookie(w, &http.Cookie{
		Name: auth.OAuthStateCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: secureCookie(s.Cfg), SameSite: http.SameSiteLaxMode,
	})

	tok, err := s.googleOAuthConfig().Exchange(r.Context(), code)
	if err != nil {
		log.Printf("oauth_google stage=google_token_exchange_failed")
		s.redirectAuthError(w, r, "google_token_exchange_failed")
		return
	}

	identity, err := s.googleIdentityFromToken(r, tok)
	if err != nil {
		log.Printf("oauth_google stage=google_userinfo_failed detail=%s", sanitizeOAuthErr(err.Error()))
		s.redirectAuthError(w, r, "google_userinfo_failed")
		return
	}

	_, sessionToken, err := s.Auth.LoginOrRegisterWithGoogle(r.Context(), identity)
	if err != nil {
		stage := googleAuthStage(err)
		log.Printf("oauth_google stage=%s", stage)
		s.redirectAuthError(w, r, stage)
		return
	}
	auth.SetSessionCookie(w, sessionToken, secureCookie(s.Cfg))
	log.Printf("oauth_google stage=ok")
	http.Redirect(w, r, s.Cfg.WebOrigin+"/app", http.StatusFound)
}

func (s *Server) googleIdentityFromToken(r *http.Request, tok *oauth2.Token) (auth.GoogleIdentity, error) {
	// Prefer OIDC id_token from the token endpoint (avoids a second userinfo hop).
	if raw, ok := tok.Extra("id_token").(string); ok && strings.TrimSpace(raw) != "" {
		id, err := auth.IdentityFromGoogleIDToken(raw, s.Cfg.GoogleClientID)
		if err == nil {
			return id, nil
		}
		log.Printf("oauth_google stage=id_token_parse_failed detail=%s", sanitizeOAuthErr(err.Error()))
		// Fall through to userinfo.
	}
	return fetchGoogleIdentity(r, tok)
}

func fetchGoogleIdentity(r *http.Request, tok *oauth2.Token) (auth.GoogleIdentity, error) {
	if tok == nil || tok.AccessToken == "" {
		return auth.GoogleIdentity{}, errors.New("missing access token")
	}
	client := oauth2.NewClient(r.Context(), oauth2.StaticTokenSource(tok))
	resp, err := client.Get("https://openidconnect.googleapis.com/userinfo")
	if err != nil {
		return auth.GoogleIdentity{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return auth.GoogleIdentity{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return auth.GoogleIdentity{}, fmt.Errorf("userinfo status %s", resp.Status)
	}
	var raw struct {
		Sub           string          `json:"sub"`
		Email         string          `json:"email"`
		EmailVerified json.RawMessage `json:"email_verified"`
		Name          string          `json:"name"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return auth.GoogleIdentity{}, err
	}
	verified, err := parseFlexibleBool(raw.EmailVerified)
	if err != nil {
		return auth.GoogleIdentity{}, fmt.Errorf("email_verified: %w", err)
	}
	return auth.GoogleIdentity{
		Sub:           raw.Sub,
		Email:         raw.Email,
		EmailVerified: verified,
		Name:          raw.Name,
	}, nil
}

func parseFlexibleBool(raw json.RawMessage) (bool, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}
	var b bool
	if err := json.Unmarshal(raw, &b); err == nil {
		return b, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case "true", "1", "yes":
			return true, nil
		case "false", "0", "no", "":
			return false, nil
		}
	}
	return false, fmt.Errorf("unsupported bool %s", string(raw))
}

func googleAuthStage(err error) string {
	switch {
	case errors.Is(err, auth.ErrGoogleMerchantCreate):
		return "google_merchant_create_failed"
	case errors.Is(err, auth.ErrGoogleSession):
		return "google_session_failed"
	case errors.Is(err, auth.ErrGoogleIdentityLink):
		return "google_identity_link_failed"
	default:
		return "google_identity_link_failed"
	}
}

func sanitizeOAuthErr(s string) string {
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	// Never echo tokens/codes if a library embeds them in errors.
	lower := strings.ToLower(s)
	for _, bad := range []string{"bearer ", "ya29.", "1//", "refresh_token", "access_token", "id_token=", "client_secret"} {
		if strings.Contains(lower, bad) {
			return "redacted"
		}
	}
	if len(s) > 160 {
		return s[:160]
	}
	return s
}

func (s *Server) redirectAuthError(w http.ResponseWriter, r *http.Request, code string) {
	base := strings.TrimRight(s.Cfg.WebOrigin, "/")
	target := base + "/login?error=" + url.QueryEscape(code)
	http.Redirect(w, r, target, http.StatusFound)
}
