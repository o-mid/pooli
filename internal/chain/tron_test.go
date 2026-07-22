package chain

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pooli-shop/pooli/internal/domain"
)

func TestParseTronCursor(t *testing.T) {
	c := ParseTronCursor(`{"min_timestamp":1700000000000,"fingerprint":"abc"}`)
	if c.MinTimestamp != 1700000000000 || c.Fingerprint != "abc" {
		t.Fatalf("unexpected %#v", c)
	}
	legacy := ParseTronCursor("tron:txid:token:to:1")
	if legacy.MinTimestamp != 0 {
		t.Fatalf("legacy cursor should be ignored, got %#v", legacy)
	}
}

func TestConfirmationDepth(t *testing.T) {
	if ConfirmationDepth(100, 100) != 1 {
		t.Fatal("same block should be 1")
	}
	if ConfirmationDepth(119, 100) != 20 {
		t.Fatal("expected 20")
	}
	if ConfirmationDepth(99, 100) != 0 {
		t.Fatal("tip behind tx should be 0")
	}
	if ConfirmationDepth(0, 100) != 0 {
		t.Fatal("missing tip")
	}
}

func TestObserveTransfersPaginationAndCursor(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if strings.Contains(r.URL.Path, "/transactions/trc20") {
			if r.URL.Query().Get("min_timestamp") == "" {
				t.Fatal("expected min_timestamp")
			}
			fp := r.URL.Query().Get("fingerprint")
			if fp == "" {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"data": []map[string]any{{
						"transaction_id": "tx1",
						"token_info":     map[string]any{"address": NileUSDTContract, "decimals": 6},
						"from":           "TFrom1111111111111111111111111111",
						"to":             "TTo222222222222222222222222222222",
						"value":          "1000000",
						"block_timestamp": 1700000001000,
					}},
					"meta": map[string]any{"fingerprint": "page2"},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{{
					"transaction_id": "tx2",
					"token_info":     map[string]any{"address": NileUSDTContract, "decimals": 6},
					"from":           "TFrom1111111111111111111111111111",
					"to":             "TTo222222222222222222222222222222",
					"value":          "2000000",
					"block_timestamp": 1700000002000,
				}},
				"meta": map[string]any{"fingerprint": ""},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	a := NewTronAdapterWithNetwork(srv.URL, "", NileUSDTContract, 20, "nile")
	a.HTTP = srv.Client()
	events, next, err := a.ObserveTransfers(context.Background(), []string{"TTo222222222222222222222222222222"}, NileUSDTContract, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events got %d calls=%d", len(events), calls)
	}
	if events[0].Confirmations != 0 || events[0].BlockNumber != 0 {
		t.Fatalf("observe must not stamp finality: %#v", events[0])
	}
	cur := ParseTronCursor(next)
	if cur.MinTimestamp != 1700000002000 {
		t.Fatalf("cursor timestamp %#v", cur)
	}
	if cur.Fingerprint != "" {
		t.Fatalf("durable cursor must not keep fingerprint %#v", cur)
	}
}

func TestVerifyAndConfirmationStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/wallet/gettransactioninfobyid"):
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "tx1", "blockNumber": 100})
		case strings.HasSuffix(r.URL.Path, "/wallet/getnowblock"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"block_header": map[string]any{"raw_data": map[string]any{"number": 119}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	a := NewTronAdapterWithNetwork(srv.URL, "key", NileUSDTContract, 20, "nile")
	a.HTTP = srv.Client()
	ev := domainEvent()
	ev.TxHash = "tx1"
	ev.To = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
	ev.TokenContract = NileUSDTContract
	out, err := a.VerifyTransfer(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if out.BlockNumber != 100 {
		t.Fatalf("block %d", out.BlockNumber)
	}
	if out.Confirmations != 20 {
		t.Fatalf("confirmations %d", out.Confirmations)
	}
	depth, err := a.ConfirmationStatus(context.Background(), out)
	if err != nil || depth != 20 {
		t.Fatalf("depth %d err %v", depth, err)
	}
}

func domainEvent() domain.ChainEvent {
	return domain.ChainEvent{
		EventID: "tron:tx1", Network: "tron", AmountBaseUnits: 1,
	}
}
