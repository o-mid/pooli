package email

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// Provider sends transactional email. Implementations must never log API keys.
type Provider interface {
	Send(ctx context.Context, message Message) (Result, error)
	Name() string
}

// Message is a transactional outbound email. From/ReplyTo are set by the
// application config — never from buyer-controlled input.
type Message struct {
	To       string
	Subject  string
	HTML     string
	Text     string
	ReplyTo  string
	EventKey string // used as Resend Idempotency-Key when non-empty
}

// Result captures provider delivery metadata safe to persist.
type Result struct {
	ProviderMessageID string
}

// ErrCategory classifies failures for retry decisions and delivery logging.
type ErrCategory string

const (
	CategoryTransient ErrCategory = "transient"
	CategoryPermanent ErrCategory = "permanent"
	CategoryConfig    ErrCategory = "config"
)

// SendError is a structured provider error. Error strings must never include secrets.
type SendError struct {
	Category   ErrCategory
	StatusCode int
	Message    string
}

func (e *SendError) Error() string {
	if e == nil {
		return "email send error"
	}
	if e.StatusCode > 0 {
		return fmt.Sprintf("email %s status=%d %s", e.Category, e.StatusCode, e.Message)
	}
	return fmt.Sprintf("email %s %s", e.Category, e.Message)
}

func (e *SendError) Temporary() bool {
	return e != nil && e.Category == CategoryTransient
}

func IsRetryable(err error) bool {
	if err == nil {
		return false
	}
	var se *SendError
	if errors.As(err, &se) {
		return se.Temporary()
	}
	s := err.Error()
	return strings.Contains(s, "temporary") ||
		strings.Contains(s, "timeout") ||
		strings.Contains(s, "connection") ||
		strings.Contains(s, "deadline")
}

func CategoryOf(err error) ErrCategory {
	if err == nil {
		return ""
	}
	var se *SendError
	if errors.As(err, &se) && se.Category != "" {
		return se.Category
	}
	if IsRetryable(err) {
		return CategoryTransient
	}
	return CategoryPermanent
}
