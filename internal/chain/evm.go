package chain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
)

// Keccak256("Transfer(address,address,uint256)")
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

type EVMAdapter struct {
	RPCURL        string
	NetworkName   string
	ChainID       int64
	TokenAllow    string
	Confirmations int
	HTTP          *http.Client
}

func NewEVMAdapter(rpcURL, network string, chainID int64, token string, confirmations int) (*EVMAdapter, error) {
	if rpcURL == "" {
		return nil, fmt.Errorf("rpc url required")
	}
	return &EVMAdapter{
		RPCURL:        rpcURL,
		NetworkName:   network,
		ChainID:       chainID,
		TokenAllow:    strings.ToLower(token),
		Confirmations: confirmations,
		HTTP:          &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func (a *EVMAdapter) Network() string { return a.NetworkName }

func (a *EVMAdapter) ValidateAddress(address string) error {
	if !strings.HasPrefix(strings.ToLower(address), "0x") || len(address) != 42 {
		return fmt.Errorf("invalid EVM address")
	}
	for _, c := range address[2:] {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return fmt.Errorf("invalid EVM address")
		}
	}
	return nil
}

func (a *EVMAdapter) NormalizeAddress(address string) string {
	return strings.ToLower(address)
}

func (a *EVMAdapter) ObserveTransfers(ctx context.Context, watchedAddresses []string, tokenContract string, fromCursor string) ([]domain.ChainEvent, string, error) {
	if a.NormalizeAddress(tokenContract) != a.TokenAllow {
		return nil, fromCursor, fmt.Errorf("token not allowlisted")
	}
	headHex, err := a.rpc(ctx, "eth_blockNumber", []any{})
	if err != nil {
		return nil, fromCursor, err
	}
	head, err := parseHexUint64(asString(headHex))
	if err != nil {
		return nil, fromCursor, err
	}
	var from uint64
	if fromCursor != "" {
		fmt.Sscanf(fromCursor, "%d", &from)
	} else if head > 200 {
		from = head - 200
	}
	to := head
	if to > from+2000 {
		to = from + 2000
	}
	if from > to {
		return nil, fmt.Sprintf("%d", head), nil
	}

	toTopics := make([]string, 0, len(watchedAddresses))
	for _, addr := range watchedAddresses {
		toTopics = append(toTopics, topicAddress(addr))
	}
	params := []any{map[string]any{
		"fromBlock": fmt.Sprintf("0x%x", from),
		"toBlock":   fmt.Sprintf("0x%x", to),
		"address":   tokenContract,
		"topics":    []any{transferTopic, nil, toTopics},
	}}
	raw, err := a.rpc(ctx, "eth_getLogs", params)
	if err != nil {
		return nil, fromCursor, err
	}
	var logs []struct {
		Address         string   `json:"address"`
		Topics          []string `json:"topics"`
		Data            string   `json:"data"`
		BlockNumber     string   `json:"blockNumber"`
		TransactionHash string   `json:"transactionHash"`
		LogIndex        string   `json:"logIndex"`
	}
	b, _ := json.Marshal(raw)
	if err := json.Unmarshal(b, &logs); err != nil {
		return nil, fromCursor, err
	}
	events := make([]domain.ChainEvent, 0, len(logs))
	for _, lg := range logs {
		if len(lg.Topics) < 3 {
			continue
		}
		blockNum, _ := parseHexUint64(lg.BlockNumber)
		logIndex64, _ := parseHexUint64(lg.LogIndex)
		logIndex := int(logIndex64)
		amount, _ := parseHexInt64(lg.Data)
		chainID := a.ChainID
		fromAddr := topicToAddress(lg.Topics[1])
		toAddr := topicToAddress(lg.Topics[2])
		events = append(events, domain.ChainEvent{
			EventID:         fmt.Sprintf("%s:%s:%d", a.NetworkName, lg.TransactionHash, logIndex),
			Network:         a.NetworkName,
			ChainID:         &chainID,
			TxHash:          lg.TransactionHash,
			LogIndex:        &logIndex,
			TokenContract:   a.NormalizeAddress(tokenContract),
			From:            fromAddr,
			To:              toAddr,
			AmountBaseUnits: amount,
			BlockNumber:     int64(blockNum),
			Confirmations:   int(head - blockNum),
			ObservedAt:      time.Now().UTC(),
		})
	}
	return events, fmt.Sprintf("%d", to+1), nil
}

func (a *EVMAdapter) VerifyTransfer(ctx context.Context, event domain.ChainEvent) (domain.ChainEvent, error) {
	if a.NormalizeAddress(event.TokenContract) != a.TokenAllow {
		return event, fmt.Errorf("wrong token")
	}
	if err := a.ValidateAddress(event.To); err != nil {
		return event, err
	}
	raw, err := a.rpc(ctx, "eth_getTransactionReceipt", []any{event.TxHash})
	if err != nil {
		return event, err
	}
	if raw == nil {
		return event, fmt.Errorf("receipt not found")
	}
	b, _ := json.Marshal(raw)
	var receipt struct {
		Status      string `json:"status"`
		BlockNumber string `json:"blockNumber"`
	}
	if err := json.Unmarshal(b, &receipt); err != nil {
		return event, err
	}
	if receipt.Status != "0x1" {
		return event, fmt.Errorf("tx failed")
	}
	headHex, err := a.rpc(ctx, "eth_blockNumber", []any{})
	if err == nil {
		head, _ := parseHexUint64(asString(headHex))
		block, _ := parseHexUint64(receipt.BlockNumber)
		event.Confirmations = int(head - block)
	}
	return event, nil
}

func (a *EVMAdapter) ConfirmationStatus(ctx context.Context, event domain.ChainEvent) (int, error) {
	headHex, err := a.rpc(ctx, "eth_blockNumber", []any{})
	if err != nil {
		return 0, err
	}
	head, err := parseHexUint64(asString(headHex))
	if err != nil {
		return 0, err
	}
	if event.BlockNumber <= 0 {
		return 0, nil
	}
	return int(head - uint64(event.BlockNumber)), nil
}

func (a *EVMAdapter) BuildPaymentHandoff(destination string, amountBaseUnits int64, tokenContract string) string {
	return fmt.Sprintf("ethereum:%s@%d/transfer?address=%s&uint256=%d", tokenContract, a.ChainID, destination, amountBaseUnits)
}

func (a *EVMAdapter) rpc(ctx context.Context, method string, params []any) (any, error) {
	payload := map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.RPCURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var out struct {
		Result any `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if out.Error != nil {
		return nil, fmt.Errorf("rpc: %s", out.Error.Message)
	}
	return out.Result, nil
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}

func parseHexUint64(s string) (uint64, error) {
	s = strings.TrimPrefix(strings.ToLower(s), "0x")
	if s == "" {
		return 0, nil
	}
	return strconv.ParseUint(s, 16, 64)
}

func parseHexInt64(s string) (int64, error) {
	u, err := parseHexUint64(s)
	return int64(u), err
}

func topicAddress(addr string) string {
	addr = strings.TrimPrefix(strings.ToLower(addr), "0x")
	return "0x" + strings.Repeat("0", 24) + addr
}

func topicToAddress(topic string) string {
	topic = strings.TrimPrefix(strings.ToLower(topic), "0x")
	if len(topic) < 40 {
		return "0x" + topic
	}
	return "0x" + topic[len(topic)-40:]
}
