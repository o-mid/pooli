package auth

import (
	"strings"
	"testing"
	"time"
)

func TestOAuthStateRoundTrip(t *testing.T) {
	secret := "test-session-secret-32chars!!!!"
	state, err := NewOAuthState(secret, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateOAuthState(secret, state); err != nil {
		t.Fatalf("validate: %v", err)
	}
	if err := ValidateOAuthState("wrong-secret", state); err == nil {
		t.Fatal("expected bad secret to fail")
	}
	parts := strings.Split(state, ".")
	tampered := parts[0] + "." + parts[1] + "." + "00"
	if err := ValidateOAuthState(secret, tampered); err == nil {
		t.Fatal("expected tampered state to fail")
	}
}

func TestOAuthStateExpired(t *testing.T) {
	secret := "test-session-secret-32chars!!!!"
	state, err := NewOAuthState(secret, -time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateOAuthState(secret, state); err == nil {
		t.Fatal("expected expired state to fail")
	}
}
