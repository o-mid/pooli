package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const CookieName = "pooli_session"

type User struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	IsAdmin bool   `json:"is_admin"`
}

type Service struct {
	Pool        *pgxpool.Pool
	AdminEmails map[string]bool
}

func (s *Service) Register(ctx context.Context, email, password, name, merchantName string) (User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || len(password) < 8 {
		return User{}, "", errors.New("invalid email or password")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, "", err
	}
	isAdmin := s.AdminEmails[email]
	var userID string
	err = s.Pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name, is_admin)
		VALUES ($1,$2,$3,$4) RETURNING id::text`, email, string(hash), name, isAdmin).Scan(&userID)
	if err != nil {
		return User{}, "", err
	}
	baseSlug := slugify(merchantName)
	if baseSlug == "" {
		baseSlug = "merchant"
	}
	var merchantID string
	for i := 0; i < 8; i++ {
		slug := baseSlug
		if i > 0 {
			slug = fmt.Sprintf("%s-%s", baseSlug, userID[:6+i%3])
		}
		err = s.Pool.QueryRow(ctx, `
			INSERT INTO merchants (name, slug) VALUES ($1,$2) RETURNING id::text`, merchantName, slug).Scan(&merchantID)
		if err == nil {
			break
		}
		if i == 7 {
			return User{}, "", err
		}
	}
	_, err = s.Pool.Exec(ctx, `
		INSERT INTO merchant_users (merchant_id, user_id, role) VALUES ($1::uuid,$2::uuid,'owner')`, merchantID, userID)
	if err != nil {
		return User{}, "", err
	}
	// free plan subscription
	_, _ = s.Pool.Exec(ctx, `
		INSERT INTO subscriptions (merchant_id, plan_id)
		SELECT $1::uuid, id FROM subscription_plans WHERE code='free' LIMIT 1`, merchantID)

	token, err := s.createSession(ctx, userID)
	if err != nil {
		return User{}, "", err
	}
	return User{ID: userID, Email: email, Name: name, IsAdmin: isAdmin}, token, nil
}

func (s *Service) Login(ctx context.Context, email, password string) (User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var u User
	var hash string
	err := s.Pool.QueryRow(ctx, `
		SELECT id::text, email, name, is_admin, password_hash FROM users WHERE email=$1`, email).
		Scan(&u.ID, &u.Email, &u.Name, &u.IsAdmin, &hash)
	if err != nil {
		return User{}, "", errors.New("invalid credentials")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return User{}, "", errors.New("invalid credentials")
	}
	if s.AdminEmails[email] && !u.IsAdmin {
		_, _ = s.Pool.Exec(ctx, `UPDATE users SET is_admin=true WHERE id=$1::uuid`, u.ID)
		u.IsAdmin = true
	}
	token, err := s.createSession(ctx, u.ID)
	if err != nil {
		return User{}, "", err
	}
	return u, token, nil
}

func (s *Service) createSession(ctx context.Context, userID string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(sum[:])
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO sessions (user_id, token_hash, expires_at)
		VALUES ($1::uuid, $2, $3)`, userID, tokenHash, time.Now().UTC().Add(30*24*time.Hour))
	return token, err
}

func (s *Service) Logout(ctx context.Context, token string) {
	sum := sha256.Sum256([]byte(token))
	_, _ = s.Pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash=$1`, hex.EncodeToString(sum[:]))
}

func (s *Service) UserFromRequest(ctx context.Context, r *http.Request) (User, error) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return User{}, errors.New("unauthenticated")
	}
	sum := sha256.Sum256([]byte(c.Value))
	var u User
	err = s.Pool.QueryRow(ctx, `
		SELECT u.id::text, u.email, u.name, u.is_admin
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash=$1 AND s.expires_at > now()`, hex.EncodeToString(sum[:])).
		Scan(&u.ID, &u.Email, &u.Name, &u.IsAdmin)
	if err != nil {
		return User{}, errors.New("unauthenticated")
	}
	return u, nil
}

func (s *Service) MerchantIDForUser(ctx context.Context, userID string) (string, error) {
	var id string
	err := s.Pool.QueryRow(ctx, `
		SELECT merchant_id::text FROM merchant_users WHERE user_id=$1::uuid ORDER BY role LIMIT 1`, userID).Scan(&id)
	if err == pgx.ErrNoRows {
		return "", errors.New("no merchant")
	}
	return id, err
}

func SetSessionCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		MaxAge:   30 * 24 * 60 * 60,
	})
}

func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' || r == '_' {
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	return out
}
