package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const TelegramInitDataMaxAge = 10 * time.Minute

var (
	ErrInitDataInvalid = errors.New("invalid telegram init data")
	ErrInitDataExpired = errors.New("telegram init data expired")
	ErrInitDataUser    = errors.New("telegram user missing")
)

// TelegramWebAppUser is the user object from Telegram.WebApp.initData.
type TelegramWebAppUser struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

// ValidateTelegramInitData checks HMAC-SHA256 per Telegram Mini App docs.
// initData must be the RAW query string Telegram sent — do not reserialize JSON.
func ValidateTelegramInitData(initData, botToken string, now time.Time, maxAge time.Duration) (TelegramWebAppUser, error) {
	var user TelegramWebAppUser
	if strings.TrimSpace(initData) == "" || strings.TrimSpace(botToken) == "" {
		return user, ErrInitDataInvalid
	}
	if maxAge <= 0 {
		maxAge = TelegramInitDataMaxAge
	}
	values, err := url.ParseQuery(initData)
	if err != nil {
		return user, ErrInitDataInvalid
	}
	gotHash := values.Get("hash")
	if gotHash == "" {
		return user, ErrInitDataInvalid
	}

	pairs := make([]string, 0, len(values))
	for key, vals := range values {
		if key == "hash" {
			continue
		}
		if len(vals) == 0 {
			continue
		}
		pairs = append(pairs, key+"="+vals[0])
	}
	sort.Strings(pairs)
	dataCheck := strings.Join(pairs, "\n")

	secret := hmacSHA256([]byte("WebAppData"), []byte(botToken))
	sum := hmacSHA256(secret, []byte(dataCheck))
	want := hex.EncodeToString(sum)
	if !hmac.Equal([]byte(want), []byte(gotHash)) {
		return user, ErrInitDataInvalid
	}

	authDateStr := values.Get("auth_date")
	authUnix, err := strconv.ParseInt(authDateStr, 10, 64)
	if err != nil || authUnix <= 0 {
		return user, ErrInitDataInvalid
	}
	authAt := time.Unix(authUnix, 0).UTC()
	if now.UTC().Sub(authAt) > maxAge {
		return user, ErrInitDataExpired
	}

	userRaw := values.Get("user")
	if userRaw == "" {
		return user, ErrInitDataUser
	}
	if err := json.Unmarshal([]byte(userRaw), &user); err != nil || user.ID == 0 {
		return user, ErrInitDataUser
	}
	return user, nil
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(data)
	return mac.Sum(nil)
}

// SignTelegramInitData is a test helper that builds a valid initData query string.
func SignTelegramInitData(botToken string, fields map[string]string) string {
	pairs := make([]string, 0, len(fields))
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		pairs = append(pairs, k+"="+fields[k])
	}
	dataCheck := strings.Join(pairs, "\n")
	secret := hmacSHA256([]byte("WebAppData"), []byte(botToken))
	sum := hmacSHA256(secret, []byte(dataCheck))
	enc := make(url.Values)
	for k, v := range fields {
		enc.Set(k, v)
	}
	enc.Set("hash", hex.EncodeToString(sum))
	return enc.Encode()
}

func TelegramUserIDString(id int64) string {
	return fmt.Sprintf("%d", id)
}
