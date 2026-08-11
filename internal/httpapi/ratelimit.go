package httpapi

import (
	"sync"
	"time"
)

// slidingWindowLimiter is a tiny in-process limiter for public endpoints.
type slidingWindowLimiter struct {
	mu      sync.Mutex
	window  time.Duration
	maxHits int
	hits    map[string][]time.Time
}

func newSlidingWindowLimiter(window time.Duration, maxHits int) *slidingWindowLimiter {
	return &slidingWindowLimiter{
		window:  window,
		maxHits: maxHits,
		hits:    map[string][]time.Time{},
	}
}

func (l *slidingWindowLimiter) allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-l.window)
	l.mu.Lock()
	defer l.mu.Unlock()
	arr := l.hits[key]
	kept := arr[:0]
	for _, t := range arr {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.maxHits {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}
