package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Stage-tagged errors for Google OAuth callback diagnostics (safe to log by stage only).
var (
	ErrGoogleIdentityLink = errors.New("google_identity_link_failed")
	ErrGoogleMerchantCreate = errors.New("google_merchant_create_failed")
	ErrGoogleSession = errors.New("google_session_failed")
)

// GoogleIdentity is the verified profile from Google's userinfo endpoint.
type GoogleIdentity struct {
	Sub           string
	Email         string
	EmailVerified bool
	Name          string
}

// LoginOrRegisterWithGoogle finds or creates a user for a verified Google identity,
// then issues a session token (same cookie flow as email/password).
func (s *Service) LoginOrRegisterWithGoogle(ctx context.Context, id GoogleIdentity) (User, string, error) {
	sub := strings.TrimSpace(id.Sub)
	email := strings.ToLower(strings.TrimSpace(id.Email))
	name := strings.TrimSpace(id.Name)
	if sub == "" {
		return User{}, "", fmt.Errorf("%w: subject required", ErrGoogleIdentityLink)
	}
	if email == "" || !id.EmailVerified {
		return User{}, "", fmt.Errorf("%w: verified email required", ErrGoogleIdentityLink)
	}
	if name == "" {
		if at := strings.IndexByte(email, '@'); at > 0 {
			name = email[:at]
		} else {
			name = "Merchant"
		}
	}

	// 1) Existing Google-linked account
	if u, err := s.userByGoogleSub(ctx, sub); err == nil {
		return s.finishGoogleLogin(ctx, u)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", fmt.Errorf("%w: lookup by sub", ErrGoogleIdentityLink)
	}

	// 2) Link to existing email account (password or phone+email)
	var u User
	var existingSub string
	err := s.Pool.QueryRow(ctx, `
		SELECT id::text, COALESCE(email,''), COALESCE(phone_e164,''), name, is_admin, COALESCE(google_sub,'')
		FROM users WHERE lower(email)=$1`, email).
		Scan(&u.ID, &u.Email, &u.Phone, &u.Name, &u.IsAdmin, &existingSub)
	if err == nil {
		if existingSub != "" && existingSub != sub {
			return User{}, "", fmt.Errorf("%w: email linked to another google account", ErrGoogleIdentityLink)
		}
		_, err = s.Pool.Exec(ctx, `
			UPDATE users
			SET google_sub=$2, email_verified_at=COALESCE(email_verified_at, now())
			WHERE id=$1::uuid`, u.ID, sub)
		if err != nil {
			return User{}, "", fmt.Errorf("%w: link update", ErrGoogleIdentityLink)
		}
		return s.finishGoogleLogin(ctx, u)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", fmt.Errorf("%w: lookup by email", ErrGoogleIdentityLink)
	}

	// 3) Create new merchant account
	isAdmin := s.AdminEmails[email]
	var userID string
	err = s.Pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name, is_admin, email_verified_at, google_sub)
		VALUES ($1,'',$2,$3,now(),$4) RETURNING id::text`, email, name, isAdmin, sub).Scan(&userID)
	if err != nil {
		return User{}, "", fmt.Errorf("%w: insert user", ErrGoogleIdentityLink)
	}
	merchantName := name
	if merchantName == "" {
		merchantName = "Store"
	}
	if _, err := s.createMerchantForUser(ctx, userID, merchantName); err != nil {
		return User{}, "", fmt.Errorf("%w: %v", ErrGoogleMerchantCreate, err)
	}
	token, err := s.createSession(ctx, userID)
	if err != nil {
		return User{}, "", fmt.Errorf("%w: %v", ErrGoogleSession, err)
	}
	return User{ID: userID, Email: email, Name: name, IsAdmin: isAdmin}, token, nil
}

func (s *Service) userByGoogleSub(ctx context.Context, sub string) (User, error) {
	var u User
	err := s.Pool.QueryRow(ctx, `
		SELECT id::text, COALESCE(email,''), COALESCE(phone_e164,''), name, is_admin
		FROM users WHERE google_sub=$1`, sub).
		Scan(&u.ID, &u.Email, &u.Phone, &u.Name, &u.IsAdmin)
	return u, err
}

func (s *Service) finishGoogleLogin(ctx context.Context, u User) (User, string, error) {
	email := strings.ToLower(strings.TrimSpace(u.Email))
	if s.AdminEmails[email] && !u.IsAdmin {
		_, _ = s.Pool.Exec(ctx, `UPDATE users SET is_admin=true WHERE id=$1::uuid`, u.ID)
		u.IsAdmin = true
	}
	token, err := s.createSession(ctx, u.ID)
	if err != nil {
		return User{}, "", fmt.Errorf("%w: %v", ErrGoogleSession, err)
	}
	return u, token, nil
}
