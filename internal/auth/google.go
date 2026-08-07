package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
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
		return User{}, "", errors.New("google subject required")
	}
	if email == "" || !id.EmailVerified {
		return User{}, "", errors.New("verified google email required")
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
		return User{}, "", err
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
			return User{}, "", errors.New("email already linked to another google account")
		}
		_, err = s.Pool.Exec(ctx, `
			UPDATE users
			SET google_sub=$2, email_verified_at=COALESCE(email_verified_at, now())
			WHERE id=$1::uuid`, u.ID, sub)
		if err != nil {
			return User{}, "", err
		}
		return s.finishGoogleLogin(ctx, u)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", err
	}

	// 3) Create new merchant account
	isAdmin := s.AdminEmails[email]
	var userID string
	err = s.Pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name, is_admin, email_verified_at, google_sub)
		VALUES ($1,'',$2,$3,now(),$4) RETURNING id::text`, email, name, isAdmin, sub).Scan(&userID)
	if err != nil {
		return User{}, "", err
	}
	merchantName := name
	if merchantName == "" {
		merchantName = "Store"
	}
	if _, err := s.createMerchantForUser(ctx, userID, merchantName); err != nil {
		return User{}, "", err
	}
	token, err := s.createSession(ctx, userID)
	if err != nil {
		return User{}, "", err
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
		return User{}, "", err
	}
	return u, token, nil
}
