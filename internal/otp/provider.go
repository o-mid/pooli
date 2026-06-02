package otp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Provider interface {
	SendOTP(ctx context.Context, phone string) error
}

// MockProvider logs OTP codes in development. Never use as sole production SMS path.
type MockProvider struct{}

func (MockProvider) SendOTP(ctx context.Context, phone string) error {
	_ = ctx
	log.Printf("otp mock: code delivery stub for %s (see service response in non-production)", phone)
	return nil
}

type Service struct {
	Pool     *pgxpool.Pool
	Provider Provider
	// DevReturnCode exposes the plaintext code in API responses when true (local only).
	DevReturnCode bool
	TTL           time.Duration
	ResendAfter   time.Duration
	MaxAttempts   int
	MaxSendPerHour int
}

func NewService(pool *pgxpool.Pool, provider Provider, appEnv string) *Service {
	dev := appEnv != "production"
	return &Service{
		Pool:           pool,
		Provider:       provider,
		DevReturnCode:  dev,
		TTL:            5 * time.Minute,
		ResendAfter:    45 * time.Second,
		MaxAttempts:    5,
		MaxSendPerHour: 8,
	}
}

func (s *Service) Send(ctx context.Context, phone, purpose string) (devCode string, err error) {
	phone, err = NormalizeIranianPhone(phone)
	if err != nil {
		return "", err
	}
	purpose = strings.TrimSpace(purpose)
	if purpose != "login" && purpose != "register" && purpose != "link" {
		return "", errors.New("invalid purpose")
	}
	if err := s.rateLimit(ctx, "send:"+phone, s.MaxSendPerHour, time.Hour); err != nil {
		return "", err
	}

	var lastSent time.Time
	_ = s.Pool.QueryRow(ctx, `
		SELECT last_sent_at FROM otp_challenges
		WHERE phone_e164=$1 AND purpose=$2 AND consumed_at IS NULL
		ORDER BY created_at DESC LIMIT 1`, phone, purpose).Scan(&lastSent)
	if !lastSent.IsZero() && time.Since(lastSent) < s.ResendAfter {
		return "", fmt.Errorf("resend available in %ds", int((s.ResendAfter-time.Since(lastSent)).Seconds())+1)
	}

	code, err := randomDigits(6)
	if err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	_, err = s.Pool.Exec(ctx, `
		INSERT INTO otp_challenges (phone_e164, purpose, code_hash, max_attempts, expires_at, last_sent_at)
		VALUES ($1,$2,$3,$4,$5,now())`,
		phone, purpose, string(hash), s.MaxAttempts, time.Now().UTC().Add(s.TTL))
	if err != nil {
		return "", err
	}
	if err := s.Provider.SendOTP(ctx, phone); err != nil {
		return "", err
	}
	if s.DevReturnCode {
		return code, nil
	}
	return "", nil
}

func (s *Service) Verify(ctx context.Context, phone, purpose, code string) error {
	phone, err := NormalizeIranianPhone(phone)
	if err != nil {
		return err
	}
	if err := s.rateLimit(ctx, "verify:"+phone, 30, time.Hour); err != nil {
		return err
	}
	var id string
	var hash string
	var attempts, maxAttempts int
	var expiresAt time.Time
	var consumed *time.Time
	err = s.Pool.QueryRow(ctx, `
		SELECT id::text, code_hash, attempts, max_attempts, expires_at, consumed_at
		FROM otp_challenges
		WHERE phone_e164=$1 AND purpose=$2
		ORDER BY created_at DESC LIMIT 1`, phone, purpose).
		Scan(&id, &hash, &attempts, &maxAttempts, &expiresAt, &consumed)
	if err != nil {
		return errors.New("invalid or expired code")
	}
	if consumed != nil {
		return errors.New("invalid or expired code")
	}
	if time.Now().UTC().After(expiresAt) {
		return errors.New("invalid or expired code")
	}
	if attempts >= maxAttempts {
		return errors.New("too many attempts")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(strings.TrimSpace(code))) != nil {
		_, _ = s.Pool.Exec(ctx, `UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1::uuid`, id)
		return errors.New("invalid or expired code")
	}
	_, err = s.Pool.Exec(ctx, `UPDATE otp_challenges SET consumed_at=now() WHERE id=$1::uuid`, id)
	return err
}

func (s *Service) rateLimit(ctx context.Context, key string, max int, window time.Duration) error {
	var started time.Time
	var hits int
	err := s.Pool.QueryRow(ctx, `SELECT window_started_at, hit_count FROM otp_rate_limits WHERE key=$1`, key).
		Scan(&started, &hits)
	now := time.Now().UTC()
	if err == pgx.ErrNoRows {
		_, err = s.Pool.Exec(ctx, `
			INSERT INTO otp_rate_limits (key, window_started_at, hit_count) VALUES ($1,$2,1)`, key, now)
		return err
	}
	if err != nil {
		return err
	}
	if now.Sub(started) > window {
		_, err = s.Pool.Exec(ctx, `
			UPDATE otp_rate_limits SET window_started_at=$2, hit_count=1 WHERE key=$1`, key, now)
		return err
	}
	if hits >= max {
		return errors.New("rate limited")
	}
	_, err = s.Pool.Exec(ctx, `UPDATE otp_rate_limits SET hit_count=hit_count+1 WHERE key=$1`, key)
	return err
}

func randomDigits(n int) (string, error) {
	const digits = "0123456789"
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = digits[int(b[i])%10]
	}
	return string(b), nil
}

// HashToken is available for future signed wallet proofs.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func envInt(k string, def int) int {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
