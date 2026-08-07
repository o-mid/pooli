package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const OAuthStateCookie = "pooli_oauth_state"

// NewOAuthState returns a signed state value (nonce.exp.sig) valid for ttl.
func NewOAuthState(secret string, ttl time.Duration) (string, error) {
	if strings.TrimSpace(secret) == "" {
		return "", errors.New("oauth state secret required")
	}
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(raw)
	exp := time.Now().UTC().Add(ttl).Unix()
	payload := fmt.Sprintf("%s.%d", nonce, exp)
	return payload + "." + signPayload(secret, payload), nil
}

// ValidateOAuthState checks HMAC and expiry.
func ValidateOAuthState(secret, state string) error {
	if strings.TrimSpace(secret) == "" || strings.TrimSpace(state) == "" {
		return errors.New("invalid oauth state")
	}
	parts := strings.Split(state, ".")
	if len(parts) != 3 {
		return errors.New("invalid oauth state")
	}
	payload := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(signPayload(secret, payload)), []byte(parts[2])) {
		return errors.New("invalid oauth state")
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return errors.New("invalid oauth state")
	}
	if time.Now().UTC().Unix() > exp {
		return errors.New("oauth state expired")
	}
	return nil
}

func signPayload(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}
