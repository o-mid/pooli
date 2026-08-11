package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/auth"
)

type onboardingSteps struct {
	Business   bool `json:"business"`
	Defaults   bool `json:"defaults"`
	Wallets    bool `json:"wallets"`
	Rail       bool `json:"rail"`
	Checkout   bool `json:"checkout"`
	Notify     bool `json:"notifications"`
	Ready      bool `json:"ready"`
	CanComplete bool `json:"can_complete"`
}

func (s *Server) handleGetOnboarding(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	out, err := s.loadOnboarding(r.Context(), mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) loadOnboarding(ctx context.Context, merchantID string) (map[string]any, error) {
	var name, display, slug, desc, logo, support, supportEmail, supportPhone, status string
	var completedAt *time.Time
	var preferredLocale string
	err := s.Pool.QueryRow(ctx, `
		SELECT name, COALESCE(NULLIF(display_name,''), name), slug, description, logo_path,
		       support_contact, support_email, support_phone, operational_status,
		       onboarding_completed_at, preferred_locale
		FROM merchants WHERE id=$1::uuid`, merchantID).
		Scan(&name, &display, &slug, &desc, &logo, &support, &supportEmail, &supportPhone,
			&status, &completedAt, &preferredLocale)
	if err != nil {
		return nil, err
	}
	var walletCount int
	_ = s.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM merchant_wallet_addresses
		WHERE merchant_id=$1::uuid AND is_active=true`, merchantID).Scan(&walletCount)

	d, _ := s.loadCheckoutDefaults(ctx, merchantID)

	businessOK := strings.TrimSpace(display) != "" && strings.TrimSpace(slug) != "" &&
		!auth.ReservedMerchantSlugs[strings.ToLower(slug)]
	defaultsOK := preferredLocale == "en" || preferredLocale == "fa"
	walletsOK := walletCount > 0
	railOK := d.DefaultNetwork == "tron" || d.DefaultNetwork == "bsc"
	checkoutOK := d.DefaultExpiryMinutes > 0
	// Notifications step is optional configuration — always "done" once merchant viewed/saved or has defaults.
	notifyOK := true
	canComplete := businessOK && walletsOK
	ready := completedAt != nil

	steps := onboardingSteps{
		Business: businessOK, Defaults: defaultsOK, Wallets: walletsOK,
		Rail: railOK, Checkout: checkoutOK, Notify: notifyOK,
		Ready: ready, CanComplete: canComplete,
	}

	logoURL := ""
	if logo != "" {
		logoURL = "/api/v1/public/uploads/" + logo
	}

	return map[string]any{
		"completed":               completedAt != nil,
		"completed_at":            completedAt,
		"operational_status":      status,
		"steps":                   steps,
		"checkout_networks":       s.Cfg.CheckoutNetworks(),
		"bsc_checkout_enabled":    s.Cfg.EnableBSCCheckout,
		"public_store_url_prefix": strings.TrimRight(s.Cfg.WebOrigin, "/") + "/",
		"merchant": map[string]any{
			"name": name, "display_name": display, "slug": slug,
			"description": desc, "logo_url": logoURL,
			"support_contact": support, "support_email": supportEmail,
			"support_phone": supportPhone, "preferred_locale": preferredLocale,
		},
		"checkout_defaults": d,
		"wallet_count":      walletCount,
	}, nil
}

func (s *Server) handleCompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.loadOnboarding(r.Context(), mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	steps, _ := state["steps"].(onboardingSteps)
	if !steps.CanComplete {
		writeErr(w, http.StatusBadRequest, "complete business profile and add at least one wallet first")
		return
	}
	_, err = s.Pool.Exec(r.Context(), `
		UPDATE merchants SET
			onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
			operational_status = CASE
				WHEN operational_status = 'new' THEN 'active'
				ELSE operational_status
			END
		WHERE id=$1::uuid`, mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out, _ := s.loadOnboarding(r.Context(), mid)
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCheckSlug(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	raw := strings.TrimSpace(r.URL.Query().Get("slug"))
	if raw == "" {
		writeErr(w, http.StatusBadRequest, "slug required")
		return
	}
	slug := auth.Slugify(raw)
	if slug == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"slug": "", "available": false, "reason": "invalid",
			"suggestion": auth.Slugify(raw + "-store"),
		})
		return
	}
	if auth.ReservedMerchantSlugs[slug] {
		writeJSON(w, http.StatusOK, map[string]any{
			"slug": slug, "available": false, "reason": "reserved",
			"suggestion": slug + "-store",
		})
		return
	}
	var taken bool
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM merchants WHERE lower(slug)=lower($1) AND id<>$2::uuid
		)`, slug, mid).Scan(&taken)
	suggestion := slug
	if taken {
		suggestion = slug + "-shop"
		for n := 2; n < 20; n++ {
			cand := slug + "-shop"
			if n > 2 {
				cand = slug + "-" + strconv.Itoa(n)
			}
			var exists bool
			_ = s.Pool.QueryRow(r.Context(), `
				SELECT EXISTS(SELECT 1 FROM merchants WHERE lower(slug)=lower($1))`, cand).Scan(&exists)
			if !exists && !auth.ReservedMerchantSlugs[cand] {
				suggestion = cand
				break
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"slug": slug, "available": !taken, "suggestion": suggestion,
	})
}

func fmtSlugSuffix(base string, n int) string {
	return strings.TrimSpace(base) + "-" + strconv.Itoa(n)
}

func (s *Server) handleSuggestSlug(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	base := auth.Slugify(name)
	if base == "" {
		base = "store"
	}
	mid, _ := s.merchantID(r.Context())
	slug := base
	for i := 0; i < 12; i++ {
		cand := slug
		if i > 0 {
			cand = fmtSlugSuffix(base, i+1)
		}
		if auth.ReservedMerchantSlugs[cand] {
			continue
		}
		var exists bool
		q := `SELECT EXISTS(SELECT 1 FROM merchants WHERE lower(slug)=lower($1)`
		args := []any{cand}
		if mid != "" {
			q += ` AND id<>$2::uuid`
			args = append(args, mid)
		}
		q += `)`
		_ = s.Pool.QueryRow(r.Context(), q, args...).Scan(&exists)
		if !exists {
			writeJSON(w, http.StatusOK, map[string]any{"slug": cand})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"slug": base + "-shop"})
}
