package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/auth"
	"github.com/pooli-shop/pooli/internal/payment"
)

func (s *Server) handleListPaymentLinks(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rows, err := s.Pool.Query(r.Context(), `
		SELECT id::text, slug, title, description, mode, fiat_amount_toman,
		       min_amount_toman, max_amount_toman, active, expires_in_minutes, created_at
		FROM payment_links WHERE merchant_id=$1::uuid
		ORDER BY created_at DESC LIMIT 100`, mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, slug, title, desc, mode string
		var amount, minA, maxA int64
		var active bool
		var expiry int
		var created time.Time
		_ = rows.Scan(&id, &slug, &title, &desc, &mode, &amount, &minA, &maxA, &active, &expiry, &created)
		out = append(out, map[string]any{
			"id": id, "slug": slug, "title": title, "description": desc, "mode": mode,
			"fiat_amount_toman": amount, "min_amount_toman": minA, "max_amount_toman": maxA,
			"active": active, "expires_in_minutes": expiry, "created_at": created,
			"public_url": s.Cfg.PublicBaseURL + "/link/" + slug,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"payment_links": out})
}

func (s *Server) handleCreatePaymentLink(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		Title            string            `json:"title"`
		Description      string            `json:"description"`
		Mode             string            `json:"mode"`
		FiatAmountToman  int64             `json:"fiat_amount_toman"`
		MinAmountToman   int64             `json:"min_amount_toman"`
		MaxAmountToman   int64             `json:"max_amount_toman"`
		Slug             string            `json:"slug"`
		SuccessMessage   string            `json:"success_message"`
		ExpiresInMinutes int               `json:"expires_in_minutes"`
		CustomerFields   map[string]string `json:"customer_fields"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode == "" {
		mode = "fixed"
	}
	if mode != "fixed" && mode != "custom_amount" {
		writeErr(w, http.StatusBadRequest, "mode must be fixed or custom_amount")
		return
	}
	if mode == "fixed" && req.FiatAmountToman <= 0 {
		writeErr(w, http.StatusBadRequest, "amount required for fixed links")
		return
	}
	if mode == "custom_amount" {
		if req.MinAmountToman <= 0 {
			req.MinAmountToman = 10000
		}
		if req.MaxAmountToman > 0 && req.MaxAmountToman < req.MinAmountToman {
			writeErr(w, http.StatusBadRequest, "max_amount must be >= min_amount")
			return
		}
	}
	slug := auth.Slugify(req.Slug)
	if slug == "" {
		slug = auth.Slugify(req.Title)
	}
	if slug == "" {
		rand, err := randomSlug(8)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		slug = "pay-" + rand
	}
	if auth.ReservedMerchantSlugs[slug] {
		writeErr(w, http.StatusBadRequest, "slug reserved")
		return
	}
	// Ensure unique among payment_links and merchants.
	var taken bool
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT EXISTS(SELECT 1 FROM payment_links WHERE lower(slug)=lower($1))
		    OR EXISTS(SELECT 1 FROM merchants WHERE lower(slug)=lower($1))`, slug).Scan(&taken)
	if taken {
		suffix, _ := randomSlug(4)
		slug = slug + "-" + suffix
	}
	expiry := req.ExpiresInMinutes
	if expiry <= 0 {
		d, _ := s.loadCheckoutDefaults(r.Context(), mid)
		expiry = d.DefaultExpiryMinutes
	}
	var fieldsJSON any
	if req.CustomerFields != nil {
		b, _ := json.Marshal(req.CustomerFields)
		fieldsJSON = string(b)
	}
	var id string
	err = s.Pool.QueryRow(r.Context(), `
		INSERT INTO payment_links (
			merchant_id, slug, title, description, mode, fiat_amount_toman,
			min_amount_toman, max_amount_toman, success_message, expires_in_minutes, customer_fields_json
		) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
		RETURNING id::text`,
		mid, slug, strings.TrimSpace(req.Title), strings.TrimSpace(req.Description), mode,
		req.FiatAmountToman, req.MinAmountToman, req.MaxAmountToman,
		strings.TrimSpace(req.SuccessMessage), expiry, fieldsJSON,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "slug": slug, "mode": mode,
		"public_url": s.Cfg.PublicBaseURL + "/link/" + slug,
	})
}

func (s *Server) handlePatchPaymentLink(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id := chi.URLParam(r, "id")
	var req struct {
		Title  *string `json:"title"`
		Active *bool   `json:"active"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	ct, err := s.Pool.Exec(r.Context(), `
		UPDATE payment_links SET
			title = COALESCE($3, title),
			active = COALESCE($4, active),
			updated_at = now()
		WHERE id=$1::uuid AND merchant_id=$2::uuid`, id, mid, req.Title, req.Active)
	if err != nil || ct.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "payment link not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handlePublicPaymentLinkStart creates a fresh order+intent from a reusable template.
func (s *Server) handlePublicPaymentLinkStart(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req struct {
		AmountToman int64 `json:"fiat_amount_toman"`
	}
	_ = decodeJSON(r, &req)

	var linkID, merchantID, title, desc, mode, success string
	var amount, minA, maxA int64
	var expiry int
	var active bool
	var fieldsRaw []byte
	err := s.Pool.QueryRow(r.Context(), `
		SELECT id::text, merchant_id::text, title, description, mode, fiat_amount_toman,
		       min_amount_toman, max_amount_toman, success_message, expires_in_minutes, active,
		       customer_fields_json
		FROM payment_links WHERE lower(slug)=lower($1)`, slug).
		Scan(&linkID, &merchantID, &title, &desc, &mode, &amount, &minA, &maxA, &success, &expiry, &active, &fieldsRaw)
	if err != nil || !active {
		writeErr(w, http.StatusNotFound, "payment link not found")
		return
	}
	var opStatus string
	_ = s.Pool.QueryRow(r.Context(), `SELECT operational_status FROM merchants WHERE id=$1::uuid`, merchantID).Scan(&opStatus)
	if opStatus == "suspended" {
		writeErr(w, http.StatusForbidden, "store unavailable")
		return
	}

	payAmount := amount
	if mode == "custom_amount" {
		payAmount = req.AmountToman
		if payAmount < minA {
			writeErr(w, http.StatusBadRequest, "amount below minimum")
			return
		}
		if maxA > 0 && payAmount > maxA {
			writeErr(w, http.StatusBadRequest, "amount above maximum")
			return
		}
	}
	if payAmount <= 0 {
		writeErr(w, http.StatusBadRequest, "amount required")
		return
	}

	defaults, _ := s.loadCheckoutDefaults(r.Context(), merchantID)
	fields := fieldDefsFromDefaults(defaults)
	if len(fieldsRaw) > 0 {
		var parsed map[string]string
		if json.Unmarshal(fieldsRaw, &parsed) == nil && len(parsed) > 0 {
			d := defaults
			d.CustomerFields = parsed
			fields = fieldDefsFromDefaults(d)
		}
	}
	networks := s.filterCheckoutNetworks(defaults.EnabledNetworks)

	orderSlug, err := randomSlug(8)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	exp := time.Now().UTC().Add(time.Duration(expiry) * time.Minute)
	var orderID string
	err = payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			INSERT INTO orders (
				merchant_id, slug, title, description, fiat_amount_toman, fiat_currency, status,
				expires_at, fulfillment_status, success_message, payment_link_id
			) VALUES ($1::uuid,$2,$3,$4,$5,'TMN','CREATED',$6,'UNFULFILLED',$7,$8::uuid)
			RETURNING id::text`,
			merchantID, orderSlug, title, desc, payAmount, exp, success, linkID).Scan(&orderID)
		if err != nil {
			return err
		}
		for i, f := range fields {
			opts := "[]"
			if len(f.Options) > 0 {
				b, _ := jsonMarshal(f.Options)
				opts = string(b)
			}
			_, err = tx.Exec(r.Context(), `
				INSERT INTO order_field_definitions (order_id, field_key, label, field_type, required, options_json, sort_order)
				VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb,$7)`, orderID, f.Key, f.Label, f.Type, f.Required, opts, i)
			if err != nil {
				return err
			}
		}
		return s.appendTimeline(r.Context(), tx, orderID, merchantID, "order.created", "system",
			"Order created from payment link", title, "buyer", map[string]any{
				"payment_link_id": linkID, "fiat_amount_toman": payAmount,
			})
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	intent, err := s.createPaymentIntentForOrder(r.Context(), merchantID, orderID, networks)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"order_id":       orderID,
		"slug":           orderSlug,
		"checkout_url":   s.Cfg.PublicBaseURL + "/p/" + orderSlug,
		"payment_intent": intent,
	})
}

func (s *Server) handlePublicPaymentLinkGet(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var title, desc, mode string
	var amount, minA, maxA int64
	var active bool
	var storeName, logo, support string
	var opStatus string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT pl.title, pl.description, pl.mode, pl.fiat_amount_toman, pl.min_amount_toman, pl.max_amount_toman, pl.active,
		       COALESCE(NULLIF(m.display_name,''), m.name), m.logo_path, m.support_contact, m.operational_status
		FROM payment_links pl
		JOIN merchants m ON m.id = pl.merchant_id
		WHERE lower(pl.slug)=lower($1)`, slug).
		Scan(&title, &desc, &mode, &amount, &minA, &maxA, &active, &storeName, &logo, &support, &opStatus)
	if err != nil || !active || opStatus == "suspended" {
		writeErr(w, http.StatusNotFound, "payment link not found")
		return
	}
	logoURL := ""
	if logo != "" {
		logoURL = "/api/v1/public/uploads/" + logo
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"slug": slug, "title": title, "description": desc, "mode": mode,
		"fiat_amount_toman": amount, "min_amount_toman": minA, "max_amount_toman": maxA,
		"store_name": storeName, "logo_url": logoURL, "support_contact": support,
	})
}

func (s *Server) handlePublicStoreGet(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if auth.ReservedMerchantSlugs[strings.ToLower(slug)] {
		writeErr(w, http.StatusNotFound, "store not found")
		return
	}
	var id, name, desc, logo, support, supportEmail, supportPhone, status string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT id::text, COALESCE(NULLIF(display_name,''), name), description, logo_path,
		       support_contact, support_email, support_phone, operational_status
		FROM merchants WHERE lower(slug)=lower($1)`, slug).
		Scan(&id, &name, &desc, &logo, &support, &supportEmail, &supportPhone, &status)
	if err != nil || status == "suspended" {
		writeErr(w, http.StatusNotFound, "store not found")
		return
	}
	logoURL := ""
	if logo != "" {
		logoURL = "/api/v1/public/uploads/" + logo
	}
	d, _ := s.loadCheckoutDefaults(r.Context(), id)
	writeJSON(w, http.StatusOK, map[string]any{
		"slug": slug, "store_name": name, "description": desc,
		"logo_url": logoURL,
		"support_contact": firstNonEmpty(support, supportEmail, supportPhone),
		"operational_status": status,
		// Do not claim KYC verification — only operational signals.
		"accepting_payments": status == "active" || status == "new",
		"default_expiry_minutes": d.DefaultExpiryMinutes,
	})
}

func (s *Server) handlePublicStorePay(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req struct {
		AmountToman int64  `json:"fiat_amount_toman"`
		Reference   string `json:"reference"`
	}
	if err := decodeJSON(r, &req); err != nil || req.AmountToman <= 0 {
		writeErr(w, http.StatusBadRequest, "amount required")
		return
	}
	var merchantID, storeName, status string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT id::text, COALESCE(NULLIF(display_name,''), name), operational_status
		FROM merchants WHERE lower(slug)=lower($1)`, slug).Scan(&merchantID, &storeName, &status)
	if err != nil || status == "suspended" {
		writeErr(w, http.StatusNotFound, "store not found")
		return
	}
	defaults, _ := s.loadCheckoutDefaults(r.Context(), merchantID)
	fields := fieldDefsFromDefaults(defaults)
	networks := s.filterCheckoutNetworks(defaults.EnabledNetworks)
	orderSlug, err := randomSlug(8)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	exp := time.Now().UTC().Add(time.Duration(defaults.DefaultExpiryMinutes) * time.Minute)
	title := storeName
	if strings.TrimSpace(req.Reference) != "" {
		title = strings.TrimSpace(req.Reference)
	}
	var orderID string
	err = payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			INSERT INTO orders (
				merchant_id, slug, title, description, merchant_reference,
				fiat_amount_toman, fiat_currency, status, expires_at, fulfillment_status, success_message
			) VALUES ($1::uuid,$2,$3,$4,$5,$6,'TMN','CREATED',$7,'UNFULFILLED',$8)
			RETURNING id::text`,
			merchantID, orderSlug, title, "", strings.TrimSpace(req.Reference),
			req.AmountToman, exp, defaults.SuccessMessage).Scan(&orderID)
		if err != nil {
			return err
		}
		for i, f := range fields {
			opts := "[]"
			if len(f.Options) > 0 {
				b, _ := jsonMarshal(f.Options)
				opts = string(b)
			}
			_, err = tx.Exec(r.Context(), `
				INSERT INTO order_field_definitions (order_id, field_key, label, field_type, required, options_json, sort_order)
				VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb,$7)`, orderID, f.Key, f.Label, f.Type, f.Required, opts, i)
			if err != nil {
				return err
			}
		}
		return s.appendTimeline(r.Context(), tx, orderID, merchantID, "order.created", "system",
			"Order created from store page", title, "buyer", map[string]any{"fiat_amount_toman": req.AmountToman})
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	intent, err := s.createPaymentIntentForOrder(r.Context(), merchantID, orderID, networks)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"order_id": orderID, "slug": orderSlug,
		"checkout_url":   s.Cfg.PublicBaseURL + "/p/" + orderSlug,
		"payment_intent": intent,
	})
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// ensurePaymentLinkIsolation is used by tests via create helper.
func (s *Server) loadPaymentLink(ctx context.Context, merchantID, id string) (map[string]any, error) {
	var slug, title, mode string
	var amount int64
	var active bool
	err := s.Pool.QueryRow(ctx, `
		SELECT slug, title, mode, fiat_amount_toman, active
		FROM payment_links WHERE id=$1::uuid AND merchant_id=$2::uuid`, id, merchantID).
		Scan(&slug, &title, &mode, &amount, &active)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "slug": slug, "title": title, "mode": mode,
		"fiat_amount_toman": amount, "active": active,
		"public_url": s.Cfg.PublicBaseURL + "/link/" + slug,
	}, nil
}
