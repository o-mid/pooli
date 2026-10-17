package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/agent"
)

const defaultModel = "claude-sonnet-4-5-20250929"

type Client struct {
	APIKey string
	Model  string
	HTTP   *http.Client
}

func NewClient(apiKey, model string) *Client {
	m := strings.TrimSpace(model)
	if m == "" {
		m = defaultModel
	}
	return &Client{
		APIKey: strings.TrimSpace(apiKey),
		Model:  m,
		HTTP:   &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *Client) DraftBuyerMessage(ctx context.Context, snap agent.OrderSnapshot, locale string) (string, error) {
	if c.APIKey == "" {
		return "", fmt.Errorf("anthropic api key not configured")
	}
	loc := "en"
	if strings.EqualFold(locale, "fa") {
		loc = "fa"
	}
	payStatus := ""
	if snap.Payment != nil {
		payStatus = strings.ToUpper(strings.TrimSpace(snap.Payment.Status))
	}
	userJSON, err := json.Marshal(map[string]any{
		"order_id":                snap.OrderID,
		"slug":                    snap.Slug,
		"title":                   snap.Title,
		"checkout_url":            snap.CheckoutURL,
		"amount_usdt_base_units":  snap.AmountUsdtBaseUnits,
		"payment_status":          payStatus,
	})
	if err != nil {
		return "", err
	}

	body := map[string]any{
		"model":      c.Model,
		"max_tokens": 512,
		"system":     systemPrompt(loc),
		"messages": []map[string]string{
			{"role": "user", "content": string(userJSON)},
		},
	}
	raw, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("anthropic api %d: %s", res.StatusCode, truncate(string(b), 200))
	}

	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(b, &parsed); err != nil {
		return "", err
	}
	var parts []string
	for _, block := range parsed.Content {
		if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
			parts = append(parts, block.Text)
		}
	}
	out := strings.TrimSpace(strings.Join(parts, ""))
	if out == "" {
		return "", fmt.Errorf("anthropic returned empty draft")
	}
	return out, nil
}

func systemPrompt(locale string) string {
	lang := "English"
	if locale == "fa" {
		lang = "Persian (Farsi)"
	}
	return strings.Join([]string{
		"You write short buyer follow-up messages for a DM commerce seller using Pooli checkout.",
		"Write in " + lang + ".",
		"Rules:",
		"- One or two short paragraphs maximum. No markdown.",
		"- Never claim payment is received or confirmed unless payment status is exactly PAID.",
		"- If status is AWAITING_PAYMENT, you may remind them to pay via the checkout link politely.",
		"- Do not invent amounts, wallet addresses, or transaction ids not in the snapshot.",
		"- Do not mention Pooli as a bank or custodian; funds go to the seller wallet.",
		"Return only the message text the seller would paste into Instagram or Telegram.",
	}, "\n")
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
