package chain

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
)

type TronAdapter struct {
	BaseURL       string
	APIKey        string
	NetworkName   string
	TokenAllow    string
	HTTP          *http.Client
	Confirmations int
}

func NewTronAdapter(baseURL, apiKey, token string, confirmations int) *TronAdapter {
	return &TronAdapter{
		BaseURL:       strings.TrimRight(baseURL, "/"),
		APIKey:        apiKey,
		NetworkName:   domain.NetworkTRON,
		TokenAllow:    token,
		HTTP:          &http.Client{Timeout: 12 * time.Second},
		Confirmations: confirmations,
	}
}

func (a *TronAdapter) Network() string { return a.NetworkName }

func (a *TronAdapter) ValidateAddress(address string) error {
	if !strings.HasPrefix(address, "T") || len(address) < 30 {
		return fmt.Errorf("invalid TRON address")
	}
	return nil
}

func (a *TronAdapter) NormalizeAddress(address string) string {
	return strings.TrimSpace(address)
}

func (a *TronAdapter) ObserveTransfers(ctx context.Context, watchedAddresses []string, tokenContract string, fromCursor string) ([]domain.ChainEvent, string, error) {
	if a.NormalizeAddress(tokenContract) != a.TokenAllow {
		return nil, fromCursor, fmt.Errorf("token not allowlisted")
	}
	var all []domain.ChainEvent
	newest := fromCursor
	for _, addr := range watchedAddresses {
		events, tip, err := a.fetchAddress(ctx, addr, tokenContract)
		if err != nil {
			return nil, fromCursor, err
		}
		for _, ev := range events {
			if fromCursor != "" && ev.EventID <= fromCursor {
				continue
			}
			all = append(all, ev)
			if ev.EventID > newest {
				newest = ev.EventID
			}
		}
		_ = tip
	}
	return all, newest, nil
}

func (a *TronAdapter) fetchAddress(ctx context.Context, address, token string) ([]domain.ChainEvent, string, error) {
	u, _ := url.Parse(a.BaseURL + "/v1/accounts/" + address + "/transactions/trc20")
	q := u.Query()
	q.Set("only_to", "true")
	q.Set("limit", "50")
	q.Set("contract_address", token)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", err
	}
	if a.APIKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", a.APIKey)
	}
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("trongrid status %d", resp.StatusCode)
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
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
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
			BlockNumber:     d.BlockTs,
			Confirmations:   a.Confirmations,
			ObservedAt:      time.Now().UTC(),
			Raw:             map[string]any{"block_timestamp": d.BlockTs},
		}
		events = append(events, ev)
	}
	tip := ""
	if len(events) > 0 {
		tip = events[0].EventID
	}
	return events, tip, nil
}

func (a *TronAdapter) VerifyTransfer(ctx context.Context, event domain.ChainEvent) (domain.ChainEvent, error) {
	if a.NormalizeAddress(event.TokenContract) != a.TokenAllow {
		return event, fmt.Errorf("wrong token")
	}
	if err := a.ValidateAddress(event.To); err != nil {
		return event, err
	}
	// Lightweight verification: re-query account TRC20 and ensure event still present.
	events, _, err := a.fetchAddress(ctx, event.To, event.TokenContract)
	if err != nil {
		return event, err
	}
	for _, e := range events {
		if e.TxHash == event.TxHash && e.AmountBaseUnits == event.AmountBaseUnits {
			event.Confirmations = a.Confirmations
			return event, nil
		}
	}
	return event, fmt.Errorf("transfer not found on trongrid")
}

func (a *TronAdapter) ConfirmationStatus(ctx context.Context, event domain.ChainEvent) (int, error) {
	return a.Confirmations, nil
}

func (a *TronAdapter) BuildPaymentHandoff(destination string, amountBaseUnits int64, tokenContract string) string {
	return fmt.Sprintf("tron:%s?amount=%d&token=%s", destination, amountBaseUnits, tokenContract)
}
