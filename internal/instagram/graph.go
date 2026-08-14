package instagram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/config"
)

// Client talks to graph.instagram.com. BaseURL overrides the messages path for tests.
type Client struct {
	Token     string
	IGUserID  string
	GraphBase string
	Version   string
	HTTP      *http.Client
	// BaseURL, when set, is the httptest origin (no /{version}/{id} prefix).
	BaseURL string
}

func NewClient(cfg config.Config) *Client {
	base := strings.TrimRight(strings.TrimSpace(cfg.InstagramGraphBase), "/")
	if base == "" {
		base = "https://graph.instagram.com"
	}
	ver := strings.TrimSpace(cfg.InstagramGraphVersion)
	if ver == "" {
		ver = "v21.0"
	}
	return &Client{
		Token:     cfg.InstagramAccessToken,
		IGUserID:  cfg.InstagramIGUserID,
		GraphBase: base,
		Version:   ver,
		HTTP:      &http.Client{Timeout: 8 * time.Second},
	}
}

func (c *Client) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 8 * time.Second}
}

func (c *Client) messagesURL() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/") + "/messages"
	}
	return fmt.Sprintf("%s/%s/%s/messages", c.GraphBase, c.Version, c.IGUserID)
}

func (c *Client) profileURL() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/") + "/messenger_profile"
	}
	return fmt.Sprintf("%s/%s/%s/messenger_profile", c.GraphBase, c.Version, c.IGUserID)
}

// SendText replies to a seller who just messaged @pooli. Callers must pass the inbound sender IGSID.
func (c *Client) SendText(ctx context.Context, recipientIGSID, text string) error {
	if c == nil || strings.TrimSpace(c.Token) == "" || strings.TrimSpace(recipientIGSID) == "" {
		return nil
	}
	payload := map[string]any{
		"recipient": map[string]string{"id": recipientIGSID},
		"message":   map[string]string{"text": text},
	}
	return c.postJSON(ctx, c.messagesURL(), payload)
}

type IceBreaker struct {
	Question string `json:"question"`
	Payload  string `json:"payload"`
}

// SetIceBreakers updates messenger_profile ice breakers (max 4). Does not block launch.
func (c *Client) SetIceBreakers(ctx context.Context, items []IceBreaker) error {
	if c == nil || strings.TrimSpace(c.Token) == "" {
		return fmt.Errorf("instagram not configured")
	}
	if len(items) == 0 || len(items) > 4 {
		return fmt.Errorf("ice breakers must be 1-4 items")
	}
	payload := map[string]any{
		"platform": "instagram",
		"ice_breakers": []map[string]any{
			{
				"locale":          "default",
				"call_to_actions": items,
			},
		},
	}
	return c.postJSON(ctx, c.profileURL(), payload)
}

func (c *Client) postJSON(ctx context.Context, url string, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.client().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("instagram graph status %d", resp.StatusCode)
	}
	var parsed struct {
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil && parsed.Error != nil && parsed.Error.Message != "" {
		return fmt.Errorf("instagram graph error")
	}
	return nil
}
