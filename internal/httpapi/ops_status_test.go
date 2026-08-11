package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pooli-shop/pooli/internal/config"
	"github.com/pooli-shop/pooli/internal/ops"
	"github.com/pooli-shop/pooli/internal/testutil"
)

func TestOpsStatusAndPhoneProviders(t *testing.T) {
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)
	cfg := config.Load()
	cfg.AppEnv = "development"
	cfg.RateProvider = "mock"
	cfg.EnableChainSimulator = true
	cfg.EnableBSCCheckout = false
	cfg.OTPSMSProvider = "mock"
	cfg.WorkerHeartbeatStale = time.Minute
	s := NewServer(cfg, pool, nil, nil, nil, nil, nil, nil, nil)

	if err := ops.Beat(context.Background(), pool, ops.ChainWorkerName, map[string]any{"test": true}); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ops/status", nil)
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body=%s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	cfgMap, _ := body["config"].(map[string]any)
	if cfgMap["phone_otp_enabled"] != true {
		t.Fatalf("dev phone otp want true got %#v", cfgMap["phone_otp_enabled"])
	}
	nets, _ := cfgMap["checkout_networks"].([]any)
	if len(nets) != 1 || nets[0] != "tron" {
		t.Fatalf("networks %#v", nets)
	}
	worker, _ := body["worker"].(map[string]any)
	if worker["ok"] != true {
		t.Fatalf("worker %#v", worker)
	}

	// Production + mock OTP → phone disabled on providers endpoint.
	cfg.AppEnv = "production"
	cfg.OTPSMSProvider = "mock"
	s = NewServer(cfg, pool, nil, nil, nil, nil, nil, nil, nil)
	req = httptest.NewRequest(http.MethodGet, "/api/v1/auth/providers", nil)
	rec = httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("providers %d", rec.Code)
	}
	var prov map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &prov)
	if prov["phone"] != false {
		t.Fatalf("production mock phone must be false, got %#v", prov)
	}
}
