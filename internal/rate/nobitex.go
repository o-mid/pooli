package rate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/shopspring/decimal"
)

// NobitexProvider fetches USDT/RLS from the public market stats API.
// Nobitex RLS markets are denominated in Iranian Rials; convert once via domain.IRRToToman.
type NobitexProvider struct {
	HTTP    *http.Client
	URL     string
	Policy  string // best_buy | best_sell | latest
	Timeout time.Duration
	MinRate decimal.Decimal
	MaxRate decimal.Decimal
}

func (n *NobitexProvider) Name() string { return "nobitex" }

func (n *NobitexProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	url := n.URL
	if url == "" {
		url = "https://api.nobitex.ir/market/stats"
	}
	client := n.HTTP
	if client == nil {
		timeout := n.Timeout
		if timeout <= 0 {
			timeout = 5 * time.Second
		}
		client = &http.Client{Timeout: timeout}
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
			Latest   string `json:"latest"`
			BestBuy  string `json:"bestBuy"`
			BestSell string `json:"bestSell"`
		} `json:"stats"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return domain.RateQuote{}, err
	}
	stat, ok := body.Stats["usdt-rls"]
	if !ok {
		return domain.RateQuote{}, fmt.Errorf("nobitex missing usdt-rls")
	}

	policy := strings.ToLower(strings.TrimSpace(n.Policy))
	if policy == "" {
		policy = "best_buy"
	}
	rawIRR, usedPolicy, err := pickNobitexField(stat.BestBuy, stat.BestSell, stat.Latest, policy)
	if err != nil {
		return domain.RateQuote{}, err
	}
	rial, err := decimal.NewFromString(rawIRR)
	if err != nil {
		return domain.RateQuote{}, fmt.Errorf("nobitex rate parse: %w", err)
	}
	if rial.LessThanOrEqual(decimal.Zero) {
		return domain.RateQuote{}, fmt.Errorf("nobitex rate non-positive")
	}
	tmn := domain.IRRToToman(rial)
	if err := boundsCheck(tmn, n.MinRate, n.MaxRate); err != nil {
		return domain.RateQuote{}, err
	}
	return domain.RateQuote{
		Rate:            tmn,
		Source:          "nobitex",
		FetchedAt:       time.Now().UTC(),
		Policy:          usedPolicy,
		SourcePair:      "USDT/RLS",
		SourceCurrency:  "IRR",
		DisplayCurrency: "TMN",
	}, nil
}

func pickNobitexField(bestBuy, bestSell, latest, policy string) (value, used string, err error) {
	switch policy {
	case "best_buy":
		if bestBuy != "" {
			return bestBuy, "best_buy", nil
		}
		if latest != "" {
			return latest, "latest", nil // same response fallback only
		}
	case "best_sell":
		if bestSell != "" {
			return bestSell, "best_sell", nil
		}
		if latest != "" {
			return latest, "latest", nil
		}
	case "latest":
		if latest != "" {
			return latest, "latest", nil
		}
	default:
		return "", "", fmt.Errorf("unknown rate policy %q", policy)
	}
	return "", "", fmt.Errorf("nobitex missing rate field for policy %s", policy)
}

func boundsCheck(rate, min, max decimal.Decimal) error {
	if !min.IsZero() && rate.LessThan(min) {
		return fmt.Errorf("rate below sanity minimum")
	}
	if !max.IsZero() && rate.GreaterThan(max) {
		return fmt.Errorf("rate above sanity maximum")
	}
	return nil
}
