package httpapi

import (
	"context"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/ops"
)

func (s *Server) watcherStaleAfter() time.Duration {
	if s.Cfg.WatcherStale <= 0 {
		return 600 * time.Second
	}
	return s.Cfg.WatcherStale
}

// effectiveCheckoutNetworks is the buyer-facing list. Flag-off or an unhealthy
// watcher hides the network. On a health-read error, BSC is withheld.
func (s *Server) effectiveCheckoutNetworks(ctx context.Context) []string {
	configured := s.Cfg.CheckoutNetworks()
	cursors, err := ops.LoadWatcherCursors(ctx, s.Pool, s.watcherStaleAfter())
	if err != nil {
		return tronOnly(configured)
	}
	gaps, err := ops.UnackedGapCounts(ctx, s.Pool)
	if err != nil {
		return tronOnly(configured)
	}
	cursors = ops.MarkCursorsUnhealthyForGaps(cursors, gaps)
	return ops.EffectiveCheckoutNetworks(configured, cursors, gaps)
}

func tronOnly(configured []string) []string {
	out := make([]string, 0, 1)
	for _, n := range configured {
		if n == domain.NetworkTRON {
			out = append(out, n)
		}
	}
	return out
}
