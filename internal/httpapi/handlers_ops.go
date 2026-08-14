package httpapi

import (
	"net/http"
	"time"

	"github.com/pooli-shop/pooli/internal/buildinfo"
	"github.com/pooli-shop/pooli/internal/ops"
)

// handleOpsStatus returns non-secret operational status for uptime monitors.
// Safe to expose publicly: enums/bools/ages only — never tokens or keys.
func (s *Server) handleOpsStatus(w http.ResponseWriter, r *http.Request) {
	sha := buildinfo.ResolveGitSHA(s.Cfg.GitSHA)
	version := sha
	if len(version) > 12 {
		version = version[:12]
	}

	stale := s.Cfg.WorkerHeartbeatStale
	if stale <= 0 {
		stale = 2 * time.Minute
	}

	hb, hbErr := ops.LoadHeartbeat(r.Context(), s.Pool, ops.ChainWorkerName, stale)
	workerOK := hbErr == nil && hb.OK

	cursors, _ := ops.LoadWatcherCursors(r.Context(), s.Pool, 5*time.Minute)
	cursorOK := true
	if len(cursors) == 0 {
		// No cursor yet may mean no wallets — not necessarily failure.
		cursorOK = true
	} else {
		for _, c := range cursors {
			if !c.OK {
				cursorOK = false
				break
			}
		}
	}

	overall := true
	if s.Cfg.AppEnv == "production" {
		overall = workerOK && s.Cfg.RateProvider != "mock" && !s.Cfg.EnableChainSimulator
	}

	status := http.StatusOK
	if !overall {
		status = http.StatusServiceUnavailable
	}

	var quoteAgeSec *float64
	var quoteSource string
	var lastQuoteAt *time.Time
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT source, fetched_at, EXTRACT(EPOCH FROM (now() - fetched_at))
		FROM exchange_rate_quotes ORDER BY fetched_at DESC LIMIT 1`).
		Scan(&quoteSource, &lastQuoteAt, &quoteAgeSec)

	var failedNotify24h, pendingNotify int
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM notification_deliveries
		WHERE status='failed' AND created_at >= now() - interval '24 hours'`).Scan(&failedNotify24h)
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM notification_deliveries WHERE status='pending'`).Scan(&pendingNotify)

	var stuckConfirming, needsReview int
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM payment_intents
		WHERE status='CONFIRMING' AND updated_at < now() - interval '30 minutes'`).Scan(&stuckConfirming)
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM payment_intents
		WHERE status IN ('NEEDS_REVIEW','UNDERPAID','OVERPAID','LATE_PAYMENT')`).Scan(&needsReview)

	alerts := []string{}
	if !workerOK {
		alerts = append(alerts, "chain_worker_heartbeat_stale")
	}
	if quoteAgeSec != nil && *quoteAgeSec > 600 {
		alerts = append(alerts, "rate_quote_stale")
	}
	if stuckConfirming > 0 {
		alerts = append(alerts, "payments_stuck_confirming")
	}
	if needsReview > 10 {
		alerts = append(alerts, "needs_review_elevated")
	}
	if failedNotify24h > 20 {
		alerts = append(alerts, "notification_failures_elevated")
	}

	writeJSON(w, status, map[string]any{
		"ok":      overall,
		"service": "pooli-api",
		"version": version,
		"git_sha": sha,
		"time":    time.Now().UTC().Format(time.RFC3339),
		"config": map[string]any{
			"app_env":                s.Cfg.AppEnv,
			"rate_provider":          s.Cfg.RateProvider,
			"rate_fallback_provider": s.Cfg.RateFallbackProvider,
			"rate_policy":            s.Cfg.RatePolicy,
			"telegram_enabled":       s.Cfg.TelegramEnabled,
			"telegram_bot_username":  s.Cfg.TelegramBotUsername,
			"email_enabled":          s.Cfg.EmailEnabled,
			"email_provider":         s.Cfg.EmailProvider,
			"email_from_address":     s.Cfg.EmailFromAddress,
			"email_reply_to":         s.Cfg.EmailReplyTo,
			"enable_chain_simulator": s.Cfg.EnableChainSimulator,
			"enable_bsc_watcher":     s.Cfg.EnableBSCWatcher,
			"enable_bsc_checkout":    s.Cfg.EnableBSCCheckout,
			"tron_network":           s.Cfg.TronNetwork,
			"phone_otp_enabled":      s.Cfg.PhoneOTPEnabled(),
			"otp_sms_provider":       s.Cfg.OTPSMSProvider,
			"checkout_networks":      s.Cfg.CheckoutNetworks(),
			"google_oauth_enabled":   s.Cfg.GoogleOAuthEnabled(),
		},
		"worker": map[string]any{
			"chain_worker": hb,
			"ok":           workerOK,
			"error": func() any {
				if hbErr != nil {
					return "no_heartbeat"
				}
				return nil
			}(),
			"stale_after_seconds": int(stale.Seconds()),
		},
		"watcher_cursors": map[string]any{
			"ok":      cursorOK,
			"cursors": cursors,
		},
		"rates": map[string]any{
			"configured_provider":  s.Cfg.RateProvider,
			"fallback_provider":    s.Cfg.RateFallbackProvider,
			"last_quote_source":    quoteSource,
			"last_quote_at":        lastQuoteAt,
			"quote_age_seconds":    quoteAgeSec,
		},
		"notifications": map[string]any{
			"failed_24h": failedNotify24h,
			"pending":    pendingNotify,
		},
		"payments": map[string]any{
			"stuck_confirming": stuckConfirming,
			"needs_review":     needsReview,
		},
		"alerts": alerts,
	})
}
