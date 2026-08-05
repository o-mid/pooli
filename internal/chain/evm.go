package chain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
)

// Keccak256("Transfer(address,address,uint256)")
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

const (
	defaultEVMCursorOverlap = 32
	defaultEVMMaxBlockSpan  = 2000
	defaultEVMAddrBatch     = 40
	defaultEVMColdLookback  = 200
)

type EVMAdapter struct {
	RPCURL             string
	NetworkName        string
	ChainID            int64
	TokenAllow         string
	TokenDecimals      int
	Confirmations      int
	CursorOverlap      uint64
	MaxBlockSpan       uint64
	AddressTopicBatch  int
	HTTP               *http.Client
	chainIDChecked     bool
}

func NewEVMAdapter(rpcURL, network string, chainID int64, token string, tokenDecimals, confirmations int) (*EVMAdapter, error) {
	if strings.TrimSpace(rpcURL) == "" {
		return nil, fmt.Errorf("rpc url required")
	}
	if tokenDecimals <= 0 {
		tokenDecimals = 18
	}
	if tokenDecimals < domain.USDTDecimals {
		return nil, fmt.Errorf("token decimals %d below pooli USDT decimals %d", tokenDecimals, domain.USDTDecimals)
	}
	overlap := uint64(defaultEVMCursorOverlap)
	span := uint64(defaultEVMMaxBlockSpan)
	batch := defaultEVMAddrBatch
	return &EVMAdapter{
		RPCURL:            rpcURL,
		NetworkName:       network,
		ChainID:           chainID,
		TokenAllow:        strings.ToLower(token),
		TokenDecimals:     tokenDecimals,
		Confirmations:     confirmations,
		CursorOverlap:     overlap,
		MaxBlockSpan:      span,
		AddressTopicBatch: batch,
		HTTP:              &http.Client{Timeout: 20 * time.Second},
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
	return strings.ToLower(strings.TrimSpace(address))
}

func (a *EVMAdapter) ObserveTransfers(ctx context.Context, watchedAddresses []string, tokenContract string, fromCursor string) ([]domain.ChainEvent, string, error) {
	if a.NormalizeAddress(tokenContract) != a.TokenAllow {
		return nil, fromCursor, fmt.Errorf("token not allowlisted")
	}
	if err := a.ensureChainID(ctx); err != nil {
		return nil, fromCursor, err
	}
	headHex, err := a.rpc(ctx, "eth_blockNumber", []any{})
	if err != nil {
		return nil, fromCursor, err
	}
	head, err := parseHexUint64(asString(headHex))
	if err != nil {
		return nil, fromCursor, err
	}

	highWater := parseBlockCursor(fromCursor)
	var from uint64
	if fromCursor == "" {
		if head > defaultEVMColdLookback {
			from = head - defaultEVMColdLookback
		}
	} else {
		from = highWater
		if a.CursorOverlap > 0 && from > a.CursorOverlap {
			from -= a.CursorOverlap
		} else {
			from = 0
		}
	}
	to := head
	if to > from+a.MaxBlockSpan {
		to = from + a.MaxBlockSpan
	}
	if from > to {
		return nil, fmt.Sprintf("%d", head+1), nil
	}

	normalized := make([]string, 0, len(watchedAddresses))
	for _, addr := range watchedAddresses {
		n := a.NormalizeAddress(addr)
		if err := a.ValidateAddress(n); err != nil {
			continue
		}
		normalized = append(normalized, n)
	}
	if len(normalized) == 0 {
		return nil, fmt.Sprintf("%d", to+1), nil
	}

	var logs []evmLog
	batch := a.AddressTopicBatch
	if batch <= 0 {
		batch = defaultEVMAddrBatch
	}
	for i := 0; i < len(normalized); i += batch {
		j := i + batch
		if j > len(normalized) {
			j = len(normalized)
		}
		part, err := a.getTransferLogs(ctx, tokenContract, from, to, normalized[i:j])
		if err != nil {
			return nil, fromCursor, err
		}
		logs = append(logs, part...)
	}

	blockTimes := map[uint64]int64{}
	events := make([]domain.ChainEvent, 0, len(logs))
	for _, lg := range logs {
		ev, err := a.eventFromLog(lg, head, blockTimes, ctx)
		if err != nil {
			continue
		}
		events = append(events, ev)
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
	if err := a.ensureChainID(ctx); err != nil {
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
		Status      string   `json:"status"`
		BlockNumber string   `json:"blockNumber"`
		Logs        []evmLog `json:"logs"`
	}
	if err := json.Unmarshal(b, &receipt); err != nil {
		return event, err
	}
	if receipt.Status != "0x1" {
		return event, fmt.Errorf("tx failed")
	}
	if event.LogIndex == nil {
		return event, fmt.Errorf("missing log index")
	}
	var match *evmLog
	for i := range receipt.Logs {
		lg := &receipt.Logs[i]
		idx, err := parseHexUint64(lg.LogIndex)
		if err != nil {
			continue
		}
		if int(idx) == *event.LogIndex {
			match = lg
			break
		}
	}
	if match == nil {
		return event, fmt.Errorf("transfer log %d missing from receipt (possible reorg)", *event.LogIndex)
	}
	if a.NormalizeAddress(match.Address) != a.TokenAllow {
		return event, fmt.Errorf("receipt log token mismatch")
	}
	if len(match.Topics) < 3 || strings.ToLower(match.Topics[0]) != transferTopic {
		return event, fmt.Errorf("receipt log is not ERC-20 Transfer")
	}
	toAddr := topicToAddress(match.Topics[2])
	if a.NormalizeAddress(toAddr) != a.NormalizeAddress(event.To) {
		return event, fmt.Errorf("receipt log destination mismatch")
	}
	onChain, err := parseHexBigInt(match.Data)
	if err != nil {
		return event, err
	}
	pooliAmt, err := OnChainAmountToPooliBase(onChain, a.TokenDecimals)
	if err != nil {
		return event, err
	}
	if pooliAmt != event.AmountBaseUnits {
		return event, fmt.Errorf("receipt log amount mismatch")
	}
	block, _ := parseHexUint64(receipt.BlockNumber)
	event.BlockNumber = int64(block)
	headHex, err := a.rpc(ctx, "eth_blockNumber", []any{})
	if err == nil {
		head, _ := parseHexUint64(asString(headHex))
		event.Confirmations = confirmations(head, block)
	}
	event.From = topicToAddress(match.Topics[1])
	event.To = a.NormalizeAddress(toAddr)
	event.TokenContract = a.TokenAllow
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
	return confirmations(head, uint64(event.BlockNumber)), nil
}

func (a *EVMAdapter) BuildPaymentHandoff(destination string, amountBaseUnits int64, tokenContract string) string {
	onChain := PooliBaseToOnChainAmount(amountBaseUnits, a.TokenDecimals)
	return fmt.Sprintf(
		"ethereum:%s@%d/transfer?address=%s&uint256=%s",
		tokenContract, a.ChainID, destination, onChain.String(),
	)
}

// OnChainAmountToPooliBase converts token native units into Pooli's 6-decimal USDT base units.
func OnChainAmountToPooliBase(onChain *big.Int, tokenDecimals int) (int64, error) {
	if onChain == nil || onChain.Sign() < 0 {
		return 0, fmt.Errorf("invalid on-chain amount")
	}
	if tokenDecimals == domain.USDTDecimals {
		if !onChain.IsInt64() {
			return 0, fmt.Errorf("amount overflows int64")
		}
		return onChain.Int64(), nil
	}
	if tokenDecimals < domain.USDTDecimals {
		return 0, fmt.Errorf("token decimals too small")
	}
	shift := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(tokenDecimals-domain.USDTDecimals)), nil)
	if new(big.Int).Mod(onChain, shift).Sign() != 0 {
		return 0, fmt.Errorf("on-chain amount not aligned to pooli precision")
	}
	scaled := new(big.Int).Div(onChain, shift)
	if !scaled.IsInt64() {
		return 0, fmt.Errorf("scaled amount overflows int64")
	}
	return scaled.Int64(), nil
}

// PooliBaseToOnChainAmount converts Pooli 6-decimal USDT base units to token native units.
func PooliBaseToOnChainAmount(pooliBase int64, tokenDecimals int) *big.Int {
	out := big.NewInt(pooliBase)
	if tokenDecimals <= domain.USDTDecimals {
		return out
	}
	shift := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(tokenDecimals-domain.USDTDecimals)), nil)
	return out.Mul(out, shift)
}

func confirmations(head, block uint64) int {
	if head < block {
		return 0
	}
	return int(head - block + 1)
}

type evmLog struct {
	Address         string   `json:"address"`
	Topics          []string `json:"topics"`
	Data            string   `json:"data"`
	BlockNumber     string   `json:"blockNumber"`
	TransactionHash string   `json:"transactionHash"`
	LogIndex        string   `json:"logIndex"`
}

func (a *EVMAdapter) getTransferLogs(ctx context.Context, tokenContract string, from, to uint64, addrs []string) ([]evmLog, error) {
	toTopics := make([]string, 0, len(addrs))
	for _, addr := range addrs {
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
		return nil, err
	}
	b, _ := json.Marshal(raw)
	var logs []evmLog
	if err := json.Unmarshal(b, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func (a *EVMAdapter) eventFromLog(lg evmLog, head uint64, blockTimes map[uint64]int64, ctx context.Context) (domain.ChainEvent, error) {
	if len(lg.Topics) < 3 {
		return domain.ChainEvent{}, fmt.Errorf("short topics")
	}
	if lg.Address != "" && a.NormalizeAddress(lg.Address) != a.TokenAllow {
		return domain.ChainEvent{}, fmt.Errorf("token mismatch")
	}
	blockNum, err := parseHexUint64(lg.BlockNumber)
	if err != nil {
		return domain.ChainEvent{}, err
	}
	logIndex64, err := parseHexUint64(lg.LogIndex)
	if err != nil {
		return domain.ChainEvent{}, err
	}
	logIndex := int(logIndex64)
	onChain, err := parseHexBigInt(lg.Data)
	if err != nil {
		return domain.ChainEvent{}, err
	}
	amount, err := OnChainAmountToPooliBase(onChain, a.TokenDecimals)
	if err != nil {
		return domain.ChainEvent{}, err
	}
	chainID := a.ChainID
	fromAddr := a.NormalizeAddress(topicToAddress(lg.Topics[1]))
	toAddr := a.NormalizeAddress(topicToAddress(lg.Topics[2]))
	txHash := strings.ToLower(lg.TransactionHash)
	ts := blockTimes[blockNum]
	if ts == 0 {
		ts = a.blockTimestamp(ctx, blockNum)
		if ts > 0 {
			blockTimes[blockNum] = ts
		}
	}
	raw := map[string]any{
		"on_chain_amount": onChain.String(),
		"token_decimals":  a.TokenDecimals,
	}
	if ts > 0 {
		raw["block_timestamp"] = ts
	}
	return domain.ChainEvent{
		EventID:         fmt.Sprintf("%s:%s:%d", a.NetworkName, txHash, logIndex),
		Network:         a.NetworkName,
		ChainID:         &chainID,
		TxHash:          txHash,
		LogIndex:        &logIndex,
		TokenContract:   a.TokenAllow,
		From:            fromAddr,
		To:              toAddr,
		AmountBaseUnits: amount,
		BlockNumber:     int64(blockNum),
		Confirmations:   confirmations(head, blockNum),
		ObservedAt:      time.Now().UTC(),
		Raw:             raw,
	}, nil
}

func (a *EVMAdapter) blockTimestamp(ctx context.Context, blockNum uint64) int64 {
	raw, err := a.rpc(ctx, "eth_getBlockByNumber", []any{fmt.Sprintf("0x%x", blockNum), false})
	if err != nil || raw == nil {
		return 0
	}
	b, _ := json.Marshal(raw)
	var block struct {
		Timestamp string `json:"timestamp"`
	}
	if err := json.Unmarshal(b, &block); err != nil {
		return 0
	}
	ts, err := parseHexUint64(block.Timestamp)
	if err != nil {
		return 0
	}
	return int64(ts)
}

func (a *EVMAdapter) ensureChainID(ctx context.Context) error {
	if a.chainIDChecked || a.ChainID == 0 {
		return nil
	}
	raw, err := a.rpc(ctx, "eth_chainId", []any{})
	if err != nil {
		return err
	}
	id, err := parseHexUint64(asString(raw))
	if err != nil {
		return err
	}
	if int64(id) != a.ChainID {
		return fmt.Errorf("rpc chain id %d != configured %d", id, a.ChainID)
	}
	a.chainIDChecked = true
	return nil
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

func parseBlockCursor(s string) uint64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}

func parseHexUint64(s string) (uint64, error) {
	s = strings.TrimPrefix(strings.ToLower(s), "0x")
	if s == "" {
		return 0, nil
	}
	return strconv.ParseUint(s, 16, 64)
}

func parseHexBigInt(s string) (*big.Int, error) {
	s = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(s)), "0x")
	if s == "" {
		return big.NewInt(0), nil
	}
	n := new(big.Int)
	if _, ok := n.SetString(s, 16); !ok {
		return nil, fmt.Errorf("invalid hex amount")
	}
	return n, nil
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
