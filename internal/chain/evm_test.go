package chain

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pooli-shop/pooli/internal/domain"
)

const testUSDT = "0x55d398326f99059ff775485246999027b3197955"

func TestOnChainAmountScale18To6(t *testing.T) {
	// 0.406620 USDT in pooli units
	pooli := int64(406620)
	onChain := PooliBaseToOnChainAmount(pooli, 18)
	want := new(big.Int).Mul(big.NewInt(406620), new(big.Int).Exp(big.NewInt(10), big.NewInt(12), nil))
	if onChain.Cmp(want) != 0 {
		t.Fatalf("on-chain=%s want=%s", onChain, want)
	}
	back, err := OnChainAmountToPooliBase(onChain, 18)
	if err != nil || back != pooli {
		t.Fatalf("roundtrip=%d err=%v", back, err)
	}
}

func TestOnChainAmountRejectsDustMisalignment(t *testing.T) {
	// 1 wei cannot map into 6-decimal pooli units
	_, err := OnChainAmountToPooliBase(big.NewInt(1), 18)
	if err == nil {
		t.Fatal("expected misalignment error")
	}
}

func TestConfirmationsFormula(t *testing.T) {
	if got := confirmations(100, 100); got != 1 {
		t.Fatalf("same block: got %d", got)
	}
	if got := confirmations(111, 100); got != 12 {
		t.Fatalf("got %d want 12", got)
	}
	if got := confirmations(99, 100); got != 0 {
		t.Fatalf("future block: got %d", got)
	}
}

func TestEVMAdapterObserveMultiLogIdentityAndScale(t *testing.T) {
	dest := "0x1111111111111111111111111111111111111111"
	other := "0x2222222222222222222222222222222222222222"
	// two Transfer logs in one tx
	amt0 := PooliBaseToOnChainAmount(1000000, 18) // 1.000000 USDT
	amt1 := PooliBaseToOnChainAmount(2000000, 18) // 2.000000 USDT
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string            `json:"method"`
			Params []json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		switch req.Method {
		case "eth_chainId":
			writeRPC(w, "0x38") // 56
		case "eth_blockNumber":
			writeRPC(w, "0x64") // 100
		case "eth_getBlockByNumber":
			writeRPC(w, map[string]any{"timestamp": "0x66"})
		case "eth_getLogs":
			writeRPC(w, []map[string]any{
				{
					"address":         testUSDT,
					"topics":          []string{transferTopic, topicAddress(other), topicAddress(dest)},
					"data":            "0x" + fmt.Sprintf("%064x", amt0),
					"blockNumber":     "0x5a", // 90
					"transactionHash": "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999",
					"logIndex":        "0x0",
				},
				{
					"address":         testUSDT,
					"topics":          []string{transferTopic, topicAddress(other), topicAddress(dest)},
					"data":            "0x" + fmt.Sprintf("%064x", amt1),
					"blockNumber":     "0x5a",
					"transactionHash": "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999",
					"logIndex":        "0x1",
				},
			})
		default:
			t.Fatalf("unexpected method %s", req.Method)
		}
	}))
	defer srv.Close()

	ad, err := NewEVMAdapter(srv.URL, "bsc", 56, testUSDT, 18, 12)
	if err != nil {
		t.Fatal(err)
	}
	ad.CursorOverlap = 0
	events, next, err := ad.ObserveTransfers(context.Background(), []string{dest}, testUSDT, "80")
	if err != nil {
		t.Fatal(err)
	}
	if next != "101" {
		t.Fatalf("next cursor=%s", next)
	}
	if len(events) != 2 {
		t.Fatalf("events=%d", len(events))
	}
	if events[0].EventID == events[1].EventID {
		t.Fatal("log indexes must yield distinct event ids")
	}
	if !strings.HasSuffix(events[0].EventID, ":0") || !strings.HasSuffix(events[1].EventID, ":1") {
		t.Fatalf("ids=%q %q", events[0].EventID, events[1].EventID)
	}
	if events[0].AmountBaseUnits != 1000000 || events[1].AmountBaseUnits != 2000000 {
		t.Fatalf("amounts=%d %d", events[0].AmountBaseUnits, events[1].AmountBaseUnits)
	}
	if events[0].Confirmations != confirmations(100, 90) {
		t.Fatalf("confirmations=%d", events[0].Confirmations)
	}
	if events[0].To != dest {
		t.Fatalf("to=%s", events[0].To)
	}
}

func TestEVMAdapterCursorOverlapReplay(t *testing.T) {
	var fromBlock string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
			Params []any  `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		switch req.Method {
		case "eth_chainId":
			writeRPC(w, "0x38")
		case "eth_blockNumber":
			writeRPC(w, "0xc8") // 200
		case "eth_getBlockByNumber":
			writeRPC(w, map[string]any{"timestamp": "0x1"})
		case "eth_getLogs":
			m := req.Params[0].(map[string]any)
			fromBlock = m["fromBlock"].(string)
			writeRPC(w, []any{})
		default:
			writeRPC(w, nil)
		}
	}))
	defer srv.Close()
	ad, err := NewEVMAdapter(srv.URL, "bsc", 56, testUSDT, 18, 12)
	if err != nil {
		t.Fatal(err)
	}
	ad.CursorOverlap = 32
	ad.MaxBlockSpan = 2000
	_, next, err := ad.ObserveTransfers(context.Background(), []string{"0x1111111111111111111111111111111111111111"}, testUSDT, "150")
	if err != nil {
		t.Fatal(err)
	}
	// high water 150 with overlap 32 → from 118
	if fromBlock != "0x76" { // 118
		t.Fatalf("fromBlock=%s want 0x76", fromBlock)
	}
	if next != "201" {
		t.Fatalf("next=%s", next)
	}
}

func TestEVMAdapterVerifyReceiptLog(t *testing.T) {
	dest := "0x1111111111111111111111111111111111111111"
	amt := PooliBaseToOnChainAmount(500000, 18)
	tx := "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		switch req.Method {
		case "eth_chainId":
			writeRPC(w, "0x38")
		case "eth_blockNumber":
			writeRPC(w, "0x6e") // 110
		case "eth_getTransactionReceipt":
			writeRPC(w, map[string]any{
				"status":      "0x1",
				"blockNumber": "0x64", // 100
				"logs": []map[string]any{
					{
						"address":         testUSDT,
						"topics":          []string{transferTopic, topicAddress("0x2222222222222222222222222222222222222222"), topicAddress(dest)},
						"data":            "0x" + fmt.Sprintf("%064x", amt),
						"logIndex":        "0x3",
						"transactionHash": tx,
						"blockNumber":     "0x64",
					},
				},
			})
		default:
			writeRPC(w, nil)
		}
	}))
	defer srv.Close()
	ad, _ := NewEVMAdapter(srv.URL, "bsc", 56, testUSDT, 18, 12)
	idx := 3
	ev := domain.ChainEvent{
		EventID: "bsc:" + tx + ":3", Network: "bsc", TxHash: tx, LogIndex: &idx,
		TokenContract: testUSDT, To: dest, AmountBaseUnits: 500000, BlockNumber: 100,
	}
	out, err := ad.VerifyTransfer(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if out.Confirmations != 11 {
		t.Fatalf("confirmations=%d", out.Confirmations)
	}
}

func TestEVMAdapterNormalizeAddressCase(t *testing.T) {
	ad, _ := NewEVMAdapter("http://127.0.0.1:9", "bsc", 56, testUSDT, 18, 12)
	mixed := "0xAbCdEf0123456789aBcDef0123456789aBcDef01"
	if err := ad.ValidateAddress(mixed); err != nil {
		t.Fatal(err)
	}
	if got := ad.NormalizeAddress(mixed); got != strings.ToLower(mixed) {
		t.Fatalf("got %s", got)
	}
}

func TestBuildPaymentHandoffUsesOnChainUnits(t *testing.T) {
	ad, _ := NewEVMAdapter("http://127.0.0.1:9", "bsc", 56, testUSDT, 18, 12)
	uri := ad.BuildPaymentHandoff("0x1111111111111111111111111111111111111111", 406620, testUSDT)
	if !strings.Contains(uri, "uint256="+PooliBaseToOnChainAmount(406620, 18).String()) {
		t.Fatalf("uri=%s", uri)
	}
}

func writeRPC(w http.ResponseWriter, result any) {
	_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
}
