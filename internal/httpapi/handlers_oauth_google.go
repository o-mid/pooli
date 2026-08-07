package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
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
	})
}

func (s *Server) handleGoogleAuthStart(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.GoogleOAuthEnabled() {
		s.redirectAuthError(w, r, "google_not_configured")
		return
	}
	state, err := auth.NewOAuthState(s.Cfg.SessionSecret, oauthStateTTL)
	if err != nil {
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
	url := s.googleOAuthConfig().AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.SetAuthURLParam("prompt", "select_account"))
	http.Redirect(w, r, url, http.StatusFound)
}

func (s *Server) handleGoogleAuthCallback(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.GoogleOAuthEnabled() {
		s.redirectAuthError(w, r, "google_not_configured")
		return
	}
	if errMsg := r.URL.Query().Get("error"); errMsg != "" {
		s.redirectAuthError(w, r, "google_denied")
		return
	}
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		s.redirectAuthError(w, r, "google_invalid_callback")
		return
	}
	c, err := r.Cookie(auth.OAuthStateCookie)
	if err != nil || c.Value == "" || c.Value != state {
		s.redirectAuthError(w, r, "google_state_mismatch")
		return
	}
	if err := auth.ValidateOAuthState(s.Cfg.SessionSecret, state); err != nil {
		s.redirectAuthError(w, r, "google_state_invalid")
		return
	}
	// Clear one-time state cookie
	http.SetCookie(w, &http.Cookie{
		Name: auth.OAuthStateCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true,
	})

	tok, err := s.googleOAuthConfig().Exchange(r.Context(), code)
	if err != nil {
		s.redirectAuthError(w, r, "google_token_exchange")
		return
	}
	identity, err := fetchGoogleIdentity(r, tok)
	if err != nil {
		s.redirectAuthError(w, r, "google_profile")
		return
	}
	_, sessionToken, err := s.Auth.LoginOrRegisterWithGoogle(r.Context(), identity)
	if err != nil {
		s.redirectAuthError(w, r, "google_login_failed")
		return
	}
	auth.SetSessionCookie(w, sessionToken, secureCookie(s.Cfg))
	http.Redirect(w, r, s.Cfg.WebOrigin+"/app", http.StatusFound)
}

func fetchGoogleIdentity(r *http.Request, tok *oauth2.Token) (auth.GoogleIdentity, error) {
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
		return auth.GoogleIdentity{}, fmt.Errorf("google userinfo status %s", resp.Status)
	}
	var raw struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return auth.GoogleIdentity{}, err
	}
	return auth.GoogleIdentity{
		Sub:           raw.Sub,
		Email:         raw.Email,
		EmailVerified: raw.EmailVerified,
		Name:          raw.Name,
	}, nil
}

func (s *Server) redirectAuthError(w http.ResponseWriter, r *http.Request, code string) {
	base := strings.TrimRight(s.Cfg.WebOrigin, "/")
	target := base + "/login?error=" + url.QueryEscape(code)
	http.Redirect(w, r, target, http.StatusFound)
}
