package httpapi

import (
	"net/http"
	"os"
	"time"

	"github.com/pooli-shop/pooli/internal/buildinfo"
	"github.com/pooli-shop/pooli/internal/ops"
)

// handleOpsStatus returns non-secret operational status for uptime monitors.
// Safe to expose publicly: enums/bools/ages only — never tokens or keys.
func (s *Server) handleOpsStatus(w http.ResponseWriter, r *http.Request) {
	sha := s.Cfg.GitSHA
	if sha == "" {
		sha = os.Getenv("GIT_SHA")
	}
	if sha == "" {
		sha = buildinfo.GitSHA
	}
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
	})
}
