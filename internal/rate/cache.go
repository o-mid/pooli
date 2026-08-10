package rate

import (
	"context"
	"sync"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
)

// CachedProvider memoizes a successful quote for TTL.
type CachedProvider struct {
	Inner    Provider
	TTL      time.Duration
	MaxAge   time.Duration
	mu       sync.Mutex
	cached   domain.RateQuote
	cachedAt time.Time
	has      bool
}

func NewCachedProvider(inner Provider, ttl, maxAge time.Duration) *CachedProvider {
	return &CachedProvider{Inner: inner, TTL: ttl, MaxAge: maxAge}
}

func (c *CachedProvider) Name() string {
	if c.Inner == nil {
		return "cached"
	}
	return "cached:" + c.Inner.Name()
}

func (c *CachedProvider) FetchUSDTTmn(ctx context.Context) (domain.RateQuote, error) {
	c.mu.Lock()
	if c.has && time.Since(c.cachedAt) < c.TTL {
		q := c.cached
		c.mu.Unlock()
		if vErr := ValidateQuote(q, c.MaxAge); vErr == nil {
			logEvent("rate_cache_hit", map[string]any{"source": q.Source})
			return q, nil
		} else {
			logEvent("rate_stale_rejected", map[string]any{"provider": "cache", "error": vErr.Error()})
		}
	} else {
		c.mu.Unlock()
		logEvent("rate_cache_miss", map[string]any{})
	}

	q, err := c.Inner.FetchUSDTTmn(ctx)
	if err != nil {
		return domain.RateQuote{}, err
	}
	if err := ValidateQuote(q, c.MaxAge); err != nil {
		return domain.RateQuote{}, err
	}
	c.mu.Lock()
	c.cached = q
	c.cachedAt = time.Now().UTC()
	c.has = true
	c.mu.Unlock()
	return q, nil
}
