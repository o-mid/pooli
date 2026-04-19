package rate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/shopspring/decimal"
)

type Provider interface {
	Name() string
	FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error)
}

type MockProvider struct {
	Rate decimal.Decimal
}

func (m MockProvider) Name() string { return "mock" }

func (m MockProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	return domain.RateQuote{Rate: m.Rate, Source: "mock", FetchedAt: time.Now().UTC()}, nil
}

type FallbackProvider struct {
	Primary  Provider
	Fallback Provider
	StaleAfter time.Duration
}

func (f FallbackProvider) Name() string { return "fallback" }

func (f FallbackProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	q, err := f.Primary.FetchUSDTTmn(ctx)
	if err == nil && !isStale(q, f.StaleAfter) {
		return q, nil
	}
	primaryErr := err
	q2, err2 := f.Fallback.FetchUSDTTmn(ctx)
	if err2 != nil {
		if primaryErr != nil {
			return domain.RateQuote{}, fmt.Errorf("rate providers failed: primary=%v fallback=%v", primaryErr, err2)
		}
		return domain.RateQuote{}, err2
	}
	return q2, nil
}

func isStale(q domain.RateQuote, after time.Duration) bool {
	if after <= 0 {
		return false
	}
	return time.Since(q.FetchedAt) > after
}

// NobitexProvider fetches USDTIRT. Nobitex IRT markets are denominated in Rial; convert to toman (/10).
type NobitexProvider struct {
	HTTP *http.Client
	URL  string
}

func (n NobitexProvider) Name() string { return "nobitex" }

func (n NobitexProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	url := n.URL
	if url == "" {
		url = "https://api.nobitex.ir/market/stats"
	}
	client := n.HTTP
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return domain.RateQuote{}, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return domain.RateQuote{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return domain.RateQuote{}, fmt.Errorf("nobitex status %d", resp.StatusCode)
	}
	var body struct {
		Stats map[string]struct {
			Latest string `json:"latest"`
		} `json:"stats"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return domain.RateQuote{}, err
	}
	stat, ok := body.Stats["usdt-rls"]
	if !ok || stat.Latest == "" {
		return domain.RateQuote{}, fmt.Errorf("nobitex missing usdt-rls")
	}
	rial, err := decimal.NewFromString(stat.Latest)
	if err != nil {
		return domain.RateQuote{}, err
	}
	tmn := rial.Div(decimal.NewFromInt(10))
	return domain.RateQuote{Rate: tmn, Source: "nobitex", FetchedAt: time.Now().UTC()}, nil
}

// WallexProvider fetches USDTTMN as fallback.
type WallexProvider struct {
	HTTP *http.Client
	URL  string
}

func (w WallexProvider) Name() string { return "wallex" }

func (w WallexProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	url := w.URL
	if url == "" {
		url = "https://api.wallex.ir/v1/markets"
	}
	client := w.HTTP
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return domain.RateQuote{}, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return domain.RateQuote{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return domain.RateQuote{}, fmt.Errorf("wallex status %d", resp.StatusCode)
	}
	var body struct {
		Result struct {
			Symbols map[string]struct {
				Stats struct {
					LastPrice string `json:"lastPrice"`
				} `json:"stats"`
			} `json:"symbols"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return domain.RateQuote{}, err
	}
	sym, ok := body.Result.Symbols["USDTTMN"]
	if !ok || sym.Stats.LastPrice == "" {
		return domain.RateQuote{}, fmt.Errorf("wallex missing USDTTMN")
	}
	rate, err := decimal.NewFromString(sym.Stats.LastPrice)
	if err != nil {
		return domain.RateQuote{}, err
	}
	return domain.RateQuote{Rate: rate, Source: "wallex", FetchedAt: time.Now().UTC()}, nil
}

func BuildProvider(name, mockRate string, stale time.Duration) (Provider, error) {
	mockDec, err := decimal.NewFromString(mockRate)
	if err != nil {
		return nil, fmt.Errorf("mock rate: %w", err)
	}
	mock := MockProvider{Rate: mockDec}
	switch name {
	case "mock":
		return mock, nil
	case "nobitex", "live":
		return FallbackProvider{
			Primary:    NobitexProvider{},
			Fallback:   FallbackProvider{Primary: WallexProvider{}, Fallback: mock, StaleAfter: stale},
			StaleAfter: stale,
		}, nil
	default:
		return mock, nil
	}
}
