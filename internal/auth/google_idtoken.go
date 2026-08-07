package auth

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// IdentityFromGoogleIDToken extracts identity claims from a Google OIDC id_token
// received from Google's token endpoint. It validates iss, aud, and exp only —
// it does not log or return the raw token.
func IdentityFromGoogleIDToken(idToken, clientID string) (GoogleIdentity, error) {
	idToken = strings.TrimSpace(idToken)
	clientID = strings.TrimSpace(clientID)
	if idToken == "" || clientID == "" {
		return GoogleIdentity{}, errors.New("id_token or client_id missing")
	}
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return GoogleIdentity{}, errors.New("malformed id_token")
	}
	payload, err := decodeJWTSegment(parts[1])
	if err != nil {
		return GoogleIdentity{}, fmt.Errorf("id_token payload: %w", err)
	}
	var claims struct {
		Iss           string       `json:"iss"`
		Aud           flexAudience `json:"aud"`
		Exp           int64        `json:"exp"`
		Sub           string       `json:"sub"`
		Email         string       `json:"email"`
		EmailVerified flexBool     `json:"email_verified"`
		Name          string       `json:"name"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return GoogleIdentity{}, fmt.Errorf("id_token claims: %w", err)
	}
	switch claims.Iss {
	case "https://accounts.google.com", "accounts.google.com":
	default:
		return GoogleIdentity{}, errors.New("id_token iss mismatch")
	}
	if !claims.Aud.contains(clientID) {
		return GoogleIdentity{}, errors.New("id_token aud mismatch")
	}
	if claims.Exp == 0 || time.Now().UTC().Unix() > claims.Exp {
		return GoogleIdentity{}, errors.New("id_token expired")
	}
	if strings.TrimSpace(claims.Sub) == "" || strings.TrimSpace(claims.Email) == "" {
		return GoogleIdentity{}, errors.New("id_token missing sub/email")
	}
	if !bool(claims.EmailVerified) {
		return GoogleIdentity{}, errors.New("id_token email not verified")
	}
	return GoogleIdentity{
		Sub:           claims.Sub,
		Email:         claims.Email,
		EmailVerified: true,
		Name:          claims.Name,
	}, nil
}

func decodeJWTSegment(seg string) ([]byte, error) {
	if b, err := base64.RawURLEncoding.DecodeString(seg); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(seg)
}

type flexBool bool

func (b *flexBool) UnmarshalJSON(data []byte) error {
	s := strings.TrimSpace(string(data))
	switch s {
	case "true", `"true"`, "1":
		*b = true
		return nil
	case "false", `"false"`, "0", "null":
		*b = false
		return nil
	default:
		var v bool
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		*b = flexBool(v)
		return nil
	}
}

type flexAudience []string

func (a *flexAudience) UnmarshalJSON(data []byte) error {
	s := strings.TrimSpace(string(data))
	if strings.HasPrefix(s, "[") {
		var arr []string
		if err := json.Unmarshal(data, &arr); err != nil {
			return err
		}
		*a = arr
		return nil
	}
	var one string
	if err := json.Unmarshal(data, &one); err != nil {
		return err
	}
	*a = []string{one}
	return nil
}

func (a flexAudience) contains(v string) bool {
	for _, x := range a {
		if x == v {
			return true
		}
	}
	return false
}
