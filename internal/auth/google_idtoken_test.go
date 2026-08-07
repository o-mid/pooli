package auth

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func TestIdentityFromGoogleIDToken(t *testing.T) {
	clientID := "test-client.apps.googleusercontent.com"
	claims := map[string]any{
		"iss":            "https://accounts.google.com",
		"aud":            clientID,
		"exp":            time.Now().UTC().Add(time.Hour).Unix(),
		"sub":            "google-sub-1",
		"email":          "user@example.com",
		"email_verified": true,
		"name":           "User Example",
	}
	tok := fakeJWT(claims)
	id, err := IdentityFromGoogleIDToken(tok, clientID)
	if err != nil {
		t.Fatal(err)
	}
	if id.Sub != "google-sub-1" || id.Email != "user@example.com" || !id.EmailVerified || id.Name != "User Example" {
		t.Fatalf("identity=%+v", id)
	}
}

func TestIdentityFromGoogleIDTokenStringVerified(t *testing.T) {
	clientID := "test-client.apps.googleusercontent.com"
	claims := map[string]any{
		"iss":            "accounts.google.com",
		"aud":            clientID,
		"exp":            time.Now().UTC().Add(time.Hour).Unix(),
		"sub":            "sub2",
		"email":          "a@b.c",
		"email_verified": "true",
		"name":           "A",
	}
	id, err := IdentityFromGoogleIDToken(fakeJWT(claims), clientID)
	if err != nil {
		t.Fatal(err)
	}
	if !id.EmailVerified {
		t.Fatal("expected verified")
	}
}

func TestIdentityFromGoogleIDTokenRejectsBadAud(t *testing.T) {
	claims := map[string]any{
		"iss": "https://accounts.google.com", "aud": "other", "exp": time.Now().Add(time.Hour).Unix(),
		"sub": "s", "email": "a@b.c", "email_verified": true,
	}
	if _, err := IdentityFromGoogleIDToken(fakeJWT(claims), "expected"); err == nil {
		t.Fatal("expected aud mismatch")
	}
}

func fakeJWT(claims map[string]any) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	raw, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return header + "." + payload + ".sig"
}
