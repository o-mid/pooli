package rate

import (
	"context"
	"fmt"
	"log"
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
	return domain.RateQuote{
		Rate:            m.Rate,
		Source:          "mock",
		FetchedAt:       time.Now().UTC(),
		Policy:          "mock",
		SourcePair:      "USDT/TMN",
		SourceCurrency:  "TMN",
		DisplayCurrency: "TMN",
	}, nil
}

type FallbackProvider struct {
	Primary    Provider
	Fallback   Provider
	StaleAfter time.Duration
	MaxAge     time.Duration
}

func (f FallbackProvider) Name() string { return "fallback" }

func (f FallbackProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	logEvent("rate_provider_request", map[string]any{"provider": f.Primary.Name()})
	q, err := f.Primary.FetchUSDTTmn(ctx)
	if err == nil {
		if verr := ValidateQuote(q, f.MaxAge); verr == nil {
			logEvent("rate_provider_success", map[string]any{"provider": f.Primary.Name(), "policy": q.Policy})
			return q, nil
		} else {
			logEvent("rate_stale_rejected", map[string]any{"provider": f.Primary.Name(), "error": verr.Error()})
			err = verr
		}
	} else {
		logEvent("rate_provider_failure", map[string]any{"provider": f.Primary.Name(), "error": err.Error()})
	}

	if f.Fallback == nil {
		return domain.RateQuote{}, err
	}
	logEvent("rate_provider_fallback", map[string]any{
		"from": f.Primary.Name(), "to": f.Fallback.Name(),
	})
	logEvent("rate_provider_request", map[string]any{"provider": f.Fallback.Name()})
	q2, err2 := f.Fallback.FetchUSDTTmn(ctx)
	if err2 != nil {
		logEvent("rate_provider_failure", map[string]any{"provider": f.Fallback.Name(), "error": err2.Error()})
		return domain.RateQuote{}, fmt.Errorf("rate providers failed: primary=%v fallback=%v", err, err2)
	}
	if verr := ValidateQuote(q2, f.MaxAge); verr != nil {
		logEvent("rate_stale_rejected", map[string]any{"provider": f.Fallback.Name(), "error": verr.Error()})
		return domain.RateQuote{}, fmt.Errorf("rate providers failed: primary=%v fallback=%v", err, verr)
	}
	logEvent("rate_provider_success", map[string]any{"provider": f.Fallback.Name(), "policy": q2.Policy})
	return q2, nil
}

// Options configures live/mock rate provider construction.
type Options struct {
	Name            string
	MockRate        string
	AppEnv          string
	Policy          string // best_buy | best_sell | latest
	CacheTTL        time.Duration
	MaxAge          time.Duration
	StaleAfter      time.Duration // kept for FallbackProvider compatibility
	Timeout         time.Duration
	MinTMNPerUSDT   decimal.Decimal
	MaxTMNPerUSDT   decimal.Decimal
}

func BuildProvider(name, mockRate string, stale time.Duration) (Provider, error) {
	return BuildProviderOpts(Options{
		Name:       name,
		MockRate:   mockRate,
		StaleAfter: stale,
		MaxAge:     stale,
		Policy:     "best_buy",
		CacheTTL:   20 * time.Second,
		Timeout:    5 * time.Second,
	})
}

func BuildProviderOpts(opts Options) (Provider, error) {
	mockDec, err := decimal.NewFromString(opts.MockRate)
	if err != nil {
		return nil, fmt.Errorf("mock rate: %w", err)
	}
	if opts.Policy == "" {
		opts.Policy = "best_buy"
	}
	if opts.Timeout <= 0 {
		opts.Timeout = 5 * time.Second
	}
	if opts.MaxAge <= 0 {
		opts.MaxAge = 60 * time.Second
	}
	if opts.StaleAfter <= 0 {
		opts.StaleAfter = opts.MaxAge
	}
	if opts.MinTMNPerUSDT.IsZero() {
		opts.MinTMNPerUSDT = decimal.NewFromInt(10000) // sanity floor
	}
	if opts.MaxTMNPerUSDT.IsZero() {
		opts.MaxTMNPerUSDT = decimal.NewFromInt(5000000) // sanity ceiling
	}

	mock := MockProvider{Rate: mockDec}
	name := opts.Name
	switch name {
	case "mock":
		if opts.AppEnv == "production" {
			return nil, fmt.Errorf("RATE_PROVIDER=mock is forbidden in production")
		}
		return mock, nil
	case "nobitex", "live":
		primary := &NobitexProvider{
			Policy:  opts.Policy,
			Timeout: opts.Timeout,
			MinRate: opts.MinTMNPerUSDT,
			MaxRate: opts.MaxTMNPerUSDT,
		}
		fallback := &WallexProvider{
			Timeout: opts.Timeout,
			MinRate: opts.MinTMNPerUSDT,
			MaxRate: opts.MaxTMNPerUSDT,
		}
		chain := FallbackProvider{
			Primary:    primary,
			Fallback:   fallback, // fail-closed: no mock tertiary
			StaleAfter: opts.StaleAfter,
			MaxAge:     opts.MaxAge,
		}
		if opts.CacheTTL > 0 {
			return NewCachedProvider(chain, opts.CacheTTL, opts.MaxAge), nil
		}
		return chain, nil
	default:
		return nil, fmt.Errorf("unknown RATE_PROVIDER %q (use mock|nobitex|live)", name)
	}
}

func ValidateQuote(q domain.RateQuote, maxAge time.Duration) error {
	if q.Rate.LessThanOrEqual(decimal.Zero) {
		return fmt.Errorf("rate must be positive")
	}
	if maxAge > 0 && !q.FetchedAt.IsZero() && time.Since(q.FetchedAt) > maxAge {
		return fmt.Errorf("rate older than max age")
	}
	return nil
}

func logEvent(event string, fields map[string]any) {
	// Structured-ish single-line logs; never includes tokens/secrets.
	log.Printf("event=%s fields=%v", event, fields)
}
