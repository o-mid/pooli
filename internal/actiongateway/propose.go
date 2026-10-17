package actiongateway

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

type ProposeRequest struct {
	OrderID        string
	OrderSlug      string
	MerchantID     string
	Body           string
	Locale         string
	PaymentStatus  string
	IdempotencyKey string
}

type ProposeResponse struct {
	ProposalID  string `json:"proposalId"`
	Deduplicated bool  `json:"deduplicated"`
	ConfirmURL  string `json:"confirmUrl"`
	State       string `json:"state"`
}

type Client struct {
	BaseURL string
	Secret  string
	HTTP    *http.Client
}

func NewClient(baseURL, secret string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		Secret:  strings.TrimSpace(secret),
		HTTP:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) ProposeMessage(ctx context.Context, req ProposeRequest) (ProposeResponse, error) {
	if c.BaseURL == "" || c.Secret == "" {
		return ProposeResponse{}, fmt.Errorf("action gateway not configured")
	}
	loc := "en"
	if strings.EqualFold(req.Locale, "fa") {
		loc = "fa"
	}
	payload := map[string]string{
		"orderId":        req.OrderID,
		"orderSlug":      req.OrderSlug,
		"merchantId":     req.MerchantID,
		"body":           req.Body,
		"locale":         loc,
		"paymentStatus":  strings.ToUpper(strings.TrimSpace(req.PaymentStatus)),
		"idempotencyKey": req.IdempotencyKey,
	}
	raw, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/internal/v1/proposals", bytes.NewReader(raw))
	if err != nil {
		return ProposeResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Pooli-Gateway-Secret", c.Secret)

	res, err := c.HTTP.Do(httpReq)
	if err != nil {
		return ProposeResponse{}, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return ProposeResponse{}, fmt.Errorf("gateway propose %d: %s", res.StatusCode, truncate(string(b), 300))
	}
	var out ProposeResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return ProposeResponse{}, err
	}
	if out.ProposalID == "" {
		return ProposeResponse{}, fmt.Errorf("gateway returned empty proposal id")
	}
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
