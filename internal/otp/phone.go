package otp

import (
	"errors"
	"regexp"
	"strings"
)

var digitsOnly = regexp.MustCompile(`\D`)

// NormalizeIranianPhone accepts 0912..., 912..., +98912... and returns +98912...
func NormalizeIranianPhone(input string) (string, error) {
	s := strings.TrimSpace(input)
	s = strings.ReplaceAll(s, " ", "")
	s = digitsOnly.ReplaceAllString(s, "")
	switch {
	case strings.HasPrefix(s, "0098"):
		s = s[4:]
	case strings.HasPrefix(s, "98") && len(s) >= 12:
		s = s[2:]
	case strings.HasPrefix(s, "0"):
		s = s[1:]
	}
	if !regexp.MustCompile(`^9\d{9}$`).MatchString(s) {
		return "", errors.New("invalid Iranian mobile number")
	}
	return "+98" + s, nil
}
