package rate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/shopspring/decimal"
)

func TestIRRToTomanSingleNormalization(t *testing.T) {
	// 1,260,000 IRR / USDT → 126,000 TMN / USDT
	tmn := domain.IRRToToman(decimal.RequireFromString("1260000"))
	if !tmn.Equal(decimal.RequireFromString("126000")) {
		t.Fatalf("got %s", tmn)
	}
	usdt, err := domain.TomanToUSDT(3_800_000, tmn)
	if err != nil {
		t.Fatal(err)
	}
	// Must NOT be 10x wrong (would be ~3 USDT if rate stayed in IRR)
	if usdt.LessThan(decimal.RequireFromString("20")) || usdt.GreaterThan(decimal.RequireFromString("50")) {
		t.Fatalf("unexpected USDT %s — possible IRR/TMN mistake", usdt)
	}
}

func TestNobitexBestBuyAndIRRConversion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"stats": map[string]any{
				"usdt-rls": map[string]string{
					"bestBuy":  "1260000",
					"bestSell": "1270000",
					"latest":   "1265000",
				},
			},
		})
	}))
	defer srv.Close()

	p := &NobitexProvider{URL: srv.URL, Policy: "best_buy", HTTP: srv.Client()}
	q, err := p.FetchUSDTTmn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !q.Rate.Equal(decimal.RequireFromString("126000")) {
		t.Fatalf("rate %s want 126000 TMN", q.Rate)
	}
	if q.Policy != "best_buy" || q.SourceCurrency != "IRR" || q.DisplayCurrency != "TMN" {
		t.Fatalf("metadata %+v", q)
	}
}

func TestNobitexMalformed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"stats":{}}`))
	}))
	defer srv.Close()
	p := &NobitexProvider{URL: srv.URL, Policy: "best_buy", HTTP: srv.Client()}
	if _, err := p.FetchUSDTTmn(context.Background()); err == nil {
		t.Fatal("expected error")
	}
}

func TestNobitexFailWallexSuccess(t *testing.T) {
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", 500)
	}))
	defer bad.Close()
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"symbols": map[string]any{
					"USDTTMN": map[string]any{"stats": map[string]string{"lastPrice": "130000"}},
				},
			},
		})
	}))
	defer good.Close()

	chain := FallbackProvider{
		Primary:  &NobitexProvider{URL: bad.URL, Policy: "best_buy", HTTP: bad.Client()},
		Fallback: &WallexProvider{URL: good.URL, HTTP: good.Client()},
		MaxAge:   time.Minute,
	}
	q, err := chain.FetchUSDTTmn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if q.Source != "wallex" || !q.Rate.Equal(decimal.RequireFromString("130000")) {
		t.Fatalf("%+v", q)
	}
}

func TestBothProvidersFailClosed(t *testing.T) {
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", 500)
	}))
	defer bad.Close()
	chain := FallbackProvider{
		Primary:  &NobitexProvider{URL: bad.URL, Policy: "latest", HTTP: bad.Client()},
		Fallback: &WallexProvider{URL: bad.URL, HTTP: bad.Client()},
		MaxAge:   time.Minute,
	}
	_, err := chain.FetchUSDTTmn(context.Background())
	if err == nil {
		t.Fatal("expected fail-closed error")
	}
	if !strings.Contains(err.Error(), "rate providers failed") {
		t.Fatalf("err %v", err)
	}
}

func TestBuildProviderNoMockTertiary(t *testing.T) {
	p, err := BuildProviderOpts(Options{
		Name: "nobitex", MockRate: "126000", Policy: "best_buy",
		CacheTTL: 0, MaxAge: time.Minute, Timeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Unwrap cache absence — should be Fallback without mock
	fb, ok := p.(FallbackProvider)
	if !ok {
		t.Fatalf("type %T", p)
	}
	if fb.Fallback.Name() != "wallex" {
		t.Fatalf("fallback %s", fb.Fallback.Name())
	}
}

func TestBuildProviderUnknownErrors(t *testing.T) {
	_, err := BuildProviderOpts(Options{Name: "typo", MockRate: "126000"})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestBuildProviderMockForbiddenInProduction(t *testing.T) {
	_, err := BuildProviderOpts(Options{Name: "mock", MockRate: "126000", AppEnv: "production"})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCacheHit(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"stats": map[string]any{
				"usdt-rls": map[string]string{"bestBuy": "1260000", "latest": "1260000"},
			},
		})
	}))
	defer srv.Close()
	inner := &NobitexProvider{URL: srv.URL, Policy: "best_buy", HTTP: srv.Client()}
	cached := NewCachedProvider(inner, time.Minute, time.Minute)
	if _, err := cached.FetchUSDTTmn(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := cached.FetchUSDTTmn(context.Background()); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("calls %d want 1", calls)
	}
}

func TestStaleQuoteRejected(t *testing.T) {
	q := domain.RateQuote{Rate: decimal.NewFromInt(100000), FetchedAt: time.Now().UTC().Add(-2 * time.Hour)}
	if err := ValidateQuote(q, time.Minute); err == nil {
		t.Fatal("expected stale")
	}
}
