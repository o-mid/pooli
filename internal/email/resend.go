package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultResendAPI = "https://api.resend.com"

// Resend sends mail via Resend's HTTP API (no SDK).
type Resend struct {
	APIKey  string
	From    string // "Pooli <notifications@notify.pooli.shop>"
	ReplyTo string
	HTTP    *http.Client
	APIBase string // override for tests
	Timeout time.Duration
}

func (r *Resend) Name() string { return "resend" }

func (r *Resend) client() *http.Client {
	if r.HTTP != nil {
		return r.HTTP
	}
	timeout := r.Timeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &http.Client{Timeout: timeout}
}

func (r *Resend) apiURL(path string) string {
	base := r.APIBase
	if base == "" {
		base = defaultResendAPI
	}
	return strings.TrimRight(base, "/") + path
}

func (r *Resend) Send(ctx context.Context, message Message) (Result, error) {
	if strings.TrimSpace(r.APIKey) == "" {
		return Result{}, &SendError{Category: CategoryConfig, Message: "missing api key"}
	}
	to, err := SanitizeAddress(message.To)
	if err != nil {
		return Result{}, &SendError{Category: CategoryPermanent, Message: "invalid recipient"}
	}
	from := strings.TrimSpace(r.From)
	if from == "" {
		return Result{}, &SendError{Category: CategoryConfig, Message: "missing from address"}
	}
	if err := RejectHeaderInjection(message.Subject); err != nil {
		return Result{}, &SendError{Category: CategoryPermanent, Message: "invalid subject"}
	}

	replyTo := strings.TrimSpace(message.ReplyTo)
	if replyTo == "" {
		replyTo = strings.TrimSpace(r.ReplyTo)
	}
	if replyTo != "" {
		if _, err := SanitizeAddress(replyTo); err != nil {
			return Result{}, &SendError{Category: CategoryConfig, Message: "invalid reply-to"}
		}
	}

	body := map[string]any{
		"from":    from,
		"to":      []string{to},
		"subject": message.Subject,
	}
	if strings.TrimSpace(message.HTML) != "" {
		body["html"] = message.HTML
	}
	if strings.TrimSpace(message.Text) != "" {
		body["text"] = message.Text
	}
	if replyTo != "" {
		body["reply_to"] = replyTo
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return Result{}, &SendError{Category: CategoryPermanent, Message: "marshal failed"}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.apiURL("/emails"), bytes.NewReader(payload))
	if err != nil {
		return Result{}, &SendError{Category: CategoryTransient, Message: "request build failed"}
	}
	req.Header.Set("Authorization", "Bearer "+r.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "pooli/1.0")
	if key := strings.TrimSpace(message.EventKey); key != "" {
		if len(key) > 256 {
			key = key[:256]
		}
		req.Header.Set("Idempotency-Key", key)
	}

	resp, err := r.client().Do(req)
	if err != nil {
		msg := "network error"
		if ctx.Err() != nil || strings.Contains(strings.ToLower(err.Error()), "timeout") ||
			strings.Contains(strings.ToLower(err.Error()), "deadline") {
			msg = "timeout"
		}
		return Result{}, &SendError{Category: CategoryTransient, Message: msg}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
		return Result{}, &SendError{
			Category:   CategoryTransient,
			StatusCode: resp.StatusCode,
			Message:    "temporary",
		}
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return Result{}, &SendError{
			Category:   CategoryPermanent,
			StatusCode: resp.StatusCode,
			Message:    "unauthorized",
		}
	}
	if resp.StatusCode >= 400 {
		return Result{}, &SendError{
			Category:   CategoryPermanent,
			StatusCode: resp.StatusCode,
			Message:    sanitizeProviderMessage(raw),
		}
	}

	var parsed struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || parsed.ID == "" {
		return Result{}, &SendError{Category: CategoryTransient, Message: "invalid response"}
	}
	return Result{ProviderMessageID: parsed.ID}, nil
}

func sanitizeProviderMessage(raw []byte) string {
	var parsed struct {
		Message string `json:"message"`
		Name    string `json:"name"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "bad request"
	}
	msg := strings.TrimSpace(parsed.Message)
	if msg == "" {
		msg = strings.TrimSpace(parsed.Name)
	}
	if msg == "" {
		return "bad request"
	}
	// Never echo anything that looks like a secret.
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "re_") || strings.Contains(lower, "api_key") || strings.Contains(lower, "bearer") {
		return "bad request"
	}
	if len(msg) > 120 {
		msg = msg[:120]
	}
	return msg
}

// FormatFrom builds `Name <addr>` for the Resend from field.
func FormatFrom(name, address string) string {
	name = strings.TrimSpace(name)
	address = strings.TrimSpace(address)
	if name == "" {
		return address
	}
	return fmt.Sprintf("%s <%s>", name, address)
}
