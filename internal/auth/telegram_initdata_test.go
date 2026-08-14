package auth

import (
	"encoding/json"
	"strconv"
	"testing"
	"time"
)

func TestValidateTelegramInitData(t *testing.T) {
	token := "test-bot-token"
	now := time.Now().UTC()
	userJSON, _ := json.Marshal(map[string]any{"id": 4242, "username": "seller", "first_name": "Ada"})
	fields := map[string]string{
		"auth_date": strconv.FormatInt(now.Unix(), 10),
		"query_id":  "AAE",
		"user":      string(userJSON),
	}
	raw := SignTelegramInitData(token, fields)

	got, err := ValidateTelegramInitData(raw, token, now, TelegramInitDataMaxAge)
	if err != nil {
		t.Fatalf("valid: %v", err)
	}
	if got.ID != 4242 || got.Username != "seller" {
		t.Fatalf("user %#v", got)
	}

	if _, err := ValidateTelegramInitData(raw+"x", token, now, TelegramInitDataMaxAge); err != ErrInitDataInvalid {
		t.Fatalf("tampered want invalid got %v", err)
	}

	old := map[string]string{
		"auth_date": strconv.FormatInt(now.Add(-20*time.Minute).Unix(), 10),
		"user":      string(userJSON),
	}
	expired := SignTelegramInitData(token, old)
	if _, err := ValidateTelegramInitData(expired, token, now, TelegramInitDataMaxAge); err != ErrInitDataExpired {
		t.Fatalf("expired want expired got %v", err)
	}

	noUser := SignTelegramInitData(token, map[string]string{
		"auth_date": strconv.FormatInt(now.Unix(), 10),
	})
	if _, err := ValidateTelegramInitData(noUser, token, now, TelegramInitDataMaxAge); err != ErrInitDataUser {
		t.Fatalf("missing user want user err got %v", err)
	}
}
