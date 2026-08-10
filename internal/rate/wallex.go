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

// WallexProvider fetches USDTTMN (already Toman-denominated) as fallback.
type WallexProvider struct {
	HTTP    *http.Client
	URL     string
	Timeout time.Duration
	MinRate decimal.Decimal
	MaxRate decimal.Decimal
}

func (w *WallexProvider) Name() string { return "wallex" }

func (w *WallexProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	url := w.URL
	if url == "" {
		url = "https://api.wallex.ir/v1/markets"
	}
	client := w.HTTP
	if client == nil {
		timeout := w.Timeout
		if timeout <= 0 {
			timeout = 5 * time.Second
		}
		client = &http.Client{Timeout: timeout}
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
	if rate.LessThanOrEqual(decimal.Zero) {
		return domain.RateQuote{}, fmt.Errorf("wallex rate non-positive")
	}
	if err := boundsCheck(rate, w.MinRate, w.MaxRate); err != nil {
		return domain.RateQuote{}, err
	}
	return domain.RateQuote{
		Rate:            rate,
		Source:          "wallex",
		FetchedAt:       time.Now().UTC(),
		Policy:          "lastPrice",
		SourcePair:      "USDTTMN",
		SourceCurrency:  "TMN",
		DisplayCurrency: "TMN",
	}, nil
}
