package chain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
)

const (
	MainnetUSDTContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
	NileUSDTContract    = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
	tronCursorOverlapMs = int64(5 * 60 * 1000)  // re-read last 5m for safe restart recovery
	tronBackfillMs      = int64(2 * 60 * 60 * 1000) // 2h lookback when no cursor
)

// TronCursor is persisted in watcher_cursors.cursor_value.
// MinTimestamp is the durable recovery boundary; Fingerprint is short-lived pagination only.
type TronCursor struct {
	MinTimestamp int64  `json:"min_timestamp"`
	Fingerprint  string `json:"fingerprint,omitempty"`
}

type TronAdapter struct {
	BaseURL       string
	APIKey        string
	NetworkName   string
	NetworkLabel  string // nile|mainnet
	TokenAllow    string
	HTTP          *http.Client
	Confirmations int
}

func NewTronAdapter(baseURL, apiKey, token string, confirmations int) *TronAdapter {
	return NewTronAdapterWithNetwork(baseURL, apiKey, token, confirmations, "nile")
}

func NewTronAdapterWithNetwork(baseURL, apiKey, token string, confirmations int, networkLabel string) *TronAdapter {
	return &TronAdapter{
		BaseURL:       strings.TrimRight(baseURL, "/"),
		APIKey:        apiKey,
		NetworkName:   domain.NetworkTRON,
		NetworkLabel:  strings.ToLower(strings.TrimSpace(networkLabel)),
		TokenAllow:    token,
		HTTP:          &http.Client{Timeout: 20 * time.Second},
		Confirmations: confirmations,
	}
}

func (a *TronAdapter) Network() string { return a.NetworkName }

func (a *TronAdapter) ValidateAddress(address string) error {
	address = strings.TrimSpace(address)
	if !strings.HasPrefix(address, "T") || len(address) != 34 {
		return fmt.Errorf("invalid TRON address")
	}
	for _, r := range address {
		if (r >= '1' && r <= '9') || (r >= 'A' && r <= 'H') || (r >= 'J' && r <= 'N') ||
			(r >= 'P' && r <= 'Z') || (r >= 'a' && r <= 'k') || (r >= 'm' && r <= 'z') {
			continue
		}
		return fmt.Errorf("invalid TRON address")
	}
	return nil
}

func (a *TronAdapter) NormalizeAddress(address string) string {
	return strings.TrimSpace(address)
}

func ParseTronCursor(raw string) TronCursor {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return TronCursor{}
	}
	var c TronCursor
	if err := json.Unmarshal([]byte(raw), &c); err == nil && c.MinTimestamp > 0 {
		return c
	}
	// Legacy EventID cursors are ignored; start with overlap backfill.
	return TronCursor{}
}

func EncodeTronCursor(c TronCursor) string {
	b, _ := json.Marshal(c)
	return string(b)
}

func (a *TronAdapter) ObserveTransfers(ctx context.Context, watchedAddresses []string, tokenContract string, fromCursor string) ([]domain.ChainEvent, string, error) {
	if a.NormalizeAddress(tokenContract) != a.TokenAllow {
		return nil, fromCursor, fmt.Errorf("token not allowlisted")
	}
	cur := ParseTronCursor(fromCursor)
	nowMs := time.Now().UnixMilli()
	if cur.MinTimestamp <= 0 {
		cur.MinTimestamp = nowMs - tronBackfillMs
	} else if cur.MinTimestamp > tronCursorOverlapMs {
		// Bounded overlap so restart recovery re-reads recent transfers.
		cur.MinTimestamp -= tronCursorOverlapMs
	}

	var all []domain.ChainEvent
	var maxTs int64
	for _, addr := range watchedAddresses {
		events, err := a.fetchAddressPages(ctx, addr, tokenContract, cur.MinTimestamp)
		if err != nil {
			return nil, fromCursor, err
		}
		for _, ev := range events {
			all = append(all, ev)
			if ts, ok := ev.Raw["block_timestamp"].(int64); ok && ts > maxTs {
				maxTs = ts
			}
		}
	}

	next := cur
	if maxTs > 0 {
		next.MinTimestamp = maxTs
	}
	next.Fingerprint = ""
	return all, EncodeTronCursor(next), nil
}

func (a *TronAdapter) fetchAddressPages(ctx context.Context, address, token string, minTimestamp int64) ([]domain.ChainEvent, error) {
	var all []domain.ChainEvent
	fingerprint := ""
	for page := 0; page < 20; page++ {
		events, nextFP, err := a.fetchAddressPage(ctx, address, token, minTimestamp, fingerprint)
		if err != nil {
			return nil, err
		}
		all = append(all, events...)
		if nextFP == "" || nextFP == fingerprint {
			break
		}
		fingerprint = nextFP
	}
	return all, nil
}

func (a *TronAdapter) fetchAddressPage(ctx context.Context, address, token string, minTimestamp int64, fingerprint string) ([]domain.ChainEvent, string, error) {
	u, _ := url.Parse(a.BaseURL + "/v1/accounts/" + address + "/transactions/trc20")
	q := u.Query()
	q.Set("only_to", "true")
	q.Set("limit", "50")
	q.Set("contract_address", token)
	if minTimestamp > 0 {
		q.Set("min_timestamp", strconv.FormatInt(minTimestamp, 10))
	}
	if fingerprint != "" {
		q.Set("fingerprint", fingerprint)
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", err
	}
	a.setHeaders(req)
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("trongrid status %d: %s", resp.StatusCode, truncate(string(bodyBytes), 200))
	}
	var body struct {
		Data []struct {
			TransactionID string `json:"transaction_id"`
			TokenInfo     struct {
				Address  string `json:"address"`
				Decimals int    `json:"decimals"`
			} `json:"token_info"`
			From    string `json:"from"`
			To      string `json:"to"`
			Value   string `json:"value"`
			BlockTs int64  `json:"block_timestamp"`
		} `json:"data"`
		Meta struct {
			Fingerprint string `json:"fingerprint"`
			Links       struct {
				Next string `json:"next"`
			} `json:"links"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(bodyBytes, &body); err != nil {
		return nil, "", err
	}
	events := make([]domain.ChainEvent, 0, len(body.Data))
	for _, d := range body.Data {
		amount, _ := strconv.ParseInt(d.Value, 10, 64)
		ev := domain.ChainEvent{
			EventID:         fmt.Sprintf("tron:%s:%s:%s:%s", d.TransactionID, d.TokenInfo.Address, d.To, d.Value),
			Network:         domain.NetworkTRON,
			TxHash:          d.TransactionID,
			TokenContract:   a.NormalizeAddress(d.TokenInfo.Address),
			From:            d.From,
			To:              d.To,
			AmountBaseUnits: amount,
			BlockNumber:     0, // filled in VerifyTransfer from chain tip/tx info
			Confirmations:   0,
			ObservedAt:      time.Now().UTC(),
			Raw: map[string]any{
				"block_timestamp": d.BlockTs,
			},
		}
		events = append(events, ev)
	}
	nextFP := body.Meta.Fingerprint
	if nextFP == "" && body.Meta.Links.Next != "" {
		if u, err := url.Parse(body.Meta.Links.Next); err == nil {
			nextFP = u.Query().Get("fingerprint")
		}
	}
	if len(body.Data) == 0 {
		nextFP = ""
	}
	return events, nextFP, nil
}

func (a *TronAdapter) VerifyTransfer(ctx context.Context, event domain.ChainEvent) (domain.ChainEvent, error) {
	if a.NormalizeAddress(event.TokenContract) != a.TokenAllow {
		return event, fmt.Errorf("wrong token")
	}
	if err := a.ValidateAddress(event.To); err != nil {
		return event, err
	}
	block, err := a.txBlockNumber(ctx, event.TxHash)
	if err != nil {
		return event, err
	}
	if block <= 0 {
		return event, fmt.Errorf("transaction block unknown")
	}
	event.BlockNumber = block
	depth, err := a.confirmationDepth(ctx, block)
	if err != nil {
		return event, err
	}
	event.Confirmations = depth
	return event, nil
}

func (a *TronAdapter) ConfirmationStatus(ctx context.Context, event domain.ChainEvent) (int, error) {
	block := event.BlockNumber
	if block <= 0 {
		b, err := a.txBlockNumber(ctx, event.TxHash)
		if err != nil {
			return 0, err
		}
		block = b
	}
	return a.confirmationDepth(ctx, block)
}

// ConfirmationDepth returns tip - txBlock + 1 (0 if tip behind / unknown).
func ConfirmationDepth(tip, txBlock int64) int {
	if tip <= 0 || txBlock <= 0 {
		return 0
	}
	depth := tip - txBlock + 1
	if depth < 0 {
		return 0
	}
	if depth > int64(^uint(0)>>1) {
		return int(^uint(0) >> 1)
	}
	return int(depth)
}

func (a *TronAdapter) confirmationDepth(ctx context.Context, txBlock int64) (int, error) {
	tip, err := a.latestBlockNumber(ctx)
	if err != nil {
		return 0, err
	}
	return ConfirmationDepth(tip, txBlock), nil
}

func (a *TronAdapter) latestBlockNumber(ctx context.Context) (int64, error) {
	var out struct {
		BlockHeader struct {
			RawData struct {
				Number int64 `json:"number"`
			} `json:"raw_data"`
		} `json:"block_header"`
	}
	if err := a.postJSON(ctx, "/wallet/getnowblock", map[string]any{}, &out); err != nil {
		return 0, err
	}
	if out.BlockHeader.RawData.Number <= 0 {
		return 0, fmt.Errorf("empty tron tip")
	}
	return out.BlockHeader.RawData.Number, nil
}

func (a *TronAdapter) txBlockNumber(ctx context.Context, txHash string) (int64, error) {
	var out struct {
		BlockNumber int64 `json:"blockNumber"`
		ID          string `json:"id"`
	}
	if err := a.postJSON(ctx, "/wallet/gettransactioninfobyid", map[string]any{"value": txHash}, &out); err != nil {
		return 0, err
	}
	if out.BlockNumber <= 0 {
		return 0, fmt.Errorf("tx info missing blockNumber")
	}
	return out.BlockNumber, nil
}

func (a *TronAdapter) postJSON(ctx context.Context, path string, payload any, dst any) error {
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	a.setHeaders(req)
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("trongrid %s status %d: %s", path, resp.StatusCode, truncate(string(body), 200))
	}
	if len(bytes.TrimSpace(body)) == 0 || string(body) == "{}" {
		return fmt.Errorf("trongrid %s empty response", path)
	}
	return json.Unmarshal(body, dst)
}

func (a *TronAdapter) setHeaders(req *http.Request) {
	if a.APIKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", a.APIKey)
	}
}

func (a *TronAdapter) BuildPaymentHandoff(destination string, amountBaseUnits int64, tokenContract string) string {
	return fmt.Sprintf("tron:%s?amount=%d&token=%s", destination, amountBaseUnits, tokenContract)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
