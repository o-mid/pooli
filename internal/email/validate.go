package email

import (
	"fmt"
	"net/mail"
	"strings"
	"unicode"
)

// SanitizeAddress validates a single email address and rejects header injection.
func SanitizeAddress(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("empty address")
	}
	if err := RejectHeaderInjection(s); err != nil {
		return "", err
	}
	addr, err := mail.ParseAddress(s)
	if err != nil {
		return "", fmt.Errorf("invalid address")
	}
	out := strings.TrimSpace(addr.Address)
	if out == "" || !strings.Contains(out, "@") {
		return "", fmt.Errorf("invalid address")
	}
	if len(out) > 254 {
		return "", fmt.Errorf("address too long")
	}
	return out, nil
}

// RejectHeaderInjection blocks CR/LF and other control characters in header fields.
func RejectHeaderInjection(s string) error {
	for _, r := range s {
		if r == '\r' || r == '\n' || r == '\x00' || (unicode.IsControl(r) && r != '\t') {
			return fmt.Errorf("header injection")
		}
	}
	return nil
}
