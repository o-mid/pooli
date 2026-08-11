package notify

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/config"
	"github.com/pooli-shop/pooli/internal/email"
)

// BuildEmail constructs the email notifier from config.
// Returns nil when EMAIL_ENABLED=false.
func BuildEmail(cfg config.Config, pool *pgxpool.Pool) (*Email, error) {
	if err := cfg.ValidateEmail(); err != nil {
		return nil, err
	}
	if !cfg.EmailEnabled {
		return &Email{Pool: pool, Enabled: false, PublicBase: cfg.PublicBaseURL}, nil
	}
	var provider email.Provider
	switch cfg.EmailProvider {
	case "resend":
		provider = &email.Resend{
			APIKey:  cfg.ResendAPIKey,
			From:    email.FormatFrom(cfg.EmailFromName, cfg.EmailFromAddress),
			ReplyTo: cfg.EmailReplyTo,
			Timeout: cfg.EmailTimeout,
		}
	case "fake":
		provider = &email.Fake{}
	default:
		return nil, fmt.Errorf("unsupported EMAIL_PROVIDER %q", cfg.EmailProvider)
	}
	return &Email{
		Pool:        pool,
		Provider:    provider,
		Enabled:     true,
		FromName:    cfg.EmailFromName,
		FromAddress: cfg.EmailFromAddress,
		ReplyTo:     cfg.EmailReplyTo,
		PublicBase:  cfg.PublicBaseURL,
	}, nil
}
