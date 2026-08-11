package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/payment"
	"github.com/pooli-shop/pooli/internal/sse"
)

var (
	errQuoteNotRefreshable = errors.New("cannot refresh quote after payment activity")
	errQuoteStillActive    = errors.New("quote still active")
)

func (s *Server) handlePublicPay(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	pay, err := s.loadPublicBySlug(r.Context(), slug)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, pay)
}

// handlePublicPayPreview returns OG-safe metadata only (no customer PII, no amount).
func (s *Server) handlePublicPayPreview(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var storeName, title, logoPath string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT COALESCE(NULLIF(m.display_name,''), m.name), o.title, COALESCE(m.logo_path,'')
		FROM orders o JOIN merchants m ON m.id = o.merchant_id
		WHERE o.slug=$1`, slug).Scan(&storeName, &title, &logoPath)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	logoURL := ""
	if logoPath != "" {
		logoURL = "/api/v1/public/uploads/" + logoPath
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"store_name": storeName,
		"title":      title,
		"store_logo_url": logoURL,
		"brand": "Pooli",
	})
}

func (s *Server) handlePublicCustomerDetails(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req struct {
		Values map[string]string `json:"values"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	var orderID, merchantID string
	err := s.Pool.QueryRow(r.Context(), `SELECT id::text, merchant_id::text FROM orders WHERE slug=$1`, slug).Scan(&orderID, &merchantID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	defs := s.loadFieldDefs(r.Context(), orderID)
	for _, d := range defs {
		key := d["key"].(string)
		required, _ := d["required"].(bool)
		val := req.Values[key]
		if required && val == "" {
			writeErr(w, http.StatusBadRequest, "missing "+key)
			return
		}
	}
	// Immutable snapshot — reject if already submitted
	var count int
	_ = s.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM order_field_values WHERE order_id=$1::uuid`, orderID).Scan(&count)
	if count > 0 {
		writeErr(w, http.StatusConflict, "already submitted")
		return
	}

	err = payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		for _, d := range defs {
			key := d["key"].(string)
			label := d["label"].(string)
			ftype := d["type"].(string)
			val := req.Values[key]
			_, err := tx.Exec(r.Context(), `
				INSERT INTO order_field_values (order_id, field_key, label, field_type, value)
				VALUES ($1::uuid,$2,$3,$4,$5)`, orderID, key, label, ftype, val)
			if err != nil {
				return err
			}
		}
		if _, err := s.upsertCustomerFromCheckout(r.Context(), tx, merchantID, orderID, req.Values); err != nil {
			return err
		}
		return s.appendTimeline(r.Context(), tx, orderID, merchantID, "customer.details_submitted", "buyer",
			"Customer details submitted", "", "buyer", map[string]any{})
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	pay, _ := s.loadPublicBySlug(r.Context(), slug)
	writeJSON(w, http.StatusOK, pay)
}

func (s *Server) handlePublicSelectNetwork(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req struct {
		Network string `json:"network"`
	}
	if err := decodeJSON(r, &req); err != nil || (req.Network != domain.NetworkTRON && req.Network != domain.NetworkBSC) {
		writeErr(w, http.StatusBadRequest, "network required")
		return
	}
	allowed := false
	for _, n := range s.Cfg.CheckoutNetworks() {
		if n == req.Network {
			allowed = true
			break
		}
	}
	if !allowed {
		writeErr(w, http.StatusBadRequest, "network unavailable")
		return
	}
	pay, err := s.loadPublicBySlug(r.Context(), slug)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	intent, _ := pay["payment_intent"].(map[string]any)
	if intent == nil {
		writeErr(w, http.StatusBadRequest, "payment intent missing")
		return
	}
	selected := pickOptionByNetwork(intent["options"], req.Network)
	if selected == nil {
		writeErr(w, http.StatusBadRequest, "network unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"selected_option": selected,
		"payment_intent": intent,
		"warning": "Send only USDT on the selected network. Wrong network funds cannot be recovered by Pooli.",
	})
}

// handlePublicRefreshQuote creates new ACTIVE options + reservations for an expired unpaid quote.
// Never mutates options that already have observed money; never reuses reservations unsafely.
func (s *Server) handlePublicRefreshQuote(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if s.refreshQuoteLimit != nil && !s.refreshQuoteLimit.allow(slug) {
		writeErr(w, http.StatusTooManyRequests, "rate limited")
		return
	}
	var orderID, merchantID, intentID, status string
	var expiresAt time.Time
	var toman int64
	err := s.Pool.QueryRow(r.Context(), `
		SELECT o.id::text, o.merchant_id::text, pi.id::text, pi.status, pi.expires_at, pi.fiat_amount_toman
		FROM orders o
		JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.slug=$1`, slug).Scan(&orderID, &merchantID, &intentID, &status, &expiresAt, &toman)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	blocked := map[string]bool{
		domain.StatusSeen: true, domain.StatusConfirming: true, domain.StatusPaid: true,
		domain.StatusUnderpaid: true, domain.StatusOverpaid: true, domain.StatusLatePayment: true,
		domain.StatusNeedsReview: true, domain.StatusDuplicatePayment: true,
	}
	if blocked[status] {
		writeErr(w, http.StatusConflict, errQuoteNotRefreshable.Error())
		return
	}
	expired := status == domain.StatusExpired || expiresAt.Before(time.Now().UTC())
	if !expired {
		writeErr(w, http.StatusConflict, errQuoteStillActive.Error())
		return
	}

	var matched int
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM matched_transactions WHERE payment_intent_id=$1::uuid`, intentID).Scan(&matched)
	if matched > 0 {
		writeErr(w, http.StatusConflict, errQuoteNotRefreshable.Error())
		return
	}

	quote, err := s.Rates.FetchUSDTTmn(r.Context())
	if err != nil || time.Since(quote.FetchedAt) > s.Cfg.RateStale {
		writeErr(w, http.StatusBadRequest, errStaleRate.Error())
		return
	}
	baseUSDT, err := payment.ComputeBaseUSDT(toman, quote.Rate)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	newExpires := time.Now().UTC().Add(s.Cfg.QuoteTTL)

	err = payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		// Serialize concurrent refresh-quote: lock intent, then re-validate.
		var lockedStatus string
		var lockedExpires time.Time
		var lockedToman int64
		err := tx.QueryRow(r.Context(), `
			SELECT o.id::text, o.merchant_id::text, pi.id::text, pi.status, pi.expires_at, pi.fiat_amount_toman
			FROM orders o
			JOIN payment_intents pi ON pi.order_id = o.id
			WHERE o.slug=$1
			FOR UPDATE OF pi`, slug).Scan(&orderID, &merchantID, &intentID, &lockedStatus, &lockedExpires, &lockedToman)
		if err != nil {
			return err
		}
		if blocked[lockedStatus] {
			return errQuoteNotRefreshable
		}
		lockedExpired := lockedStatus == domain.StatusExpired || lockedExpires.Before(time.Now().UTC())
		if !lockedExpired {
			return errQuoteStillActive
		}
		var lockedMatched int
		if err := tx.QueryRow(r.Context(), `
			SELECT COUNT(*) FROM matched_transactions WHERE payment_intent_id=$1::uuid`, intentID).Scan(&lockedMatched); err != nil {
			return err
		}
		if lockedMatched > 0 {
			return errQuoteNotRefreshable
		}
		status = lockedStatus
		toman = lockedToman
		baseUSDT, err = payment.ComputeBaseUSDT(toman, quote.Rate)
		if err != nil {
			return err
		}

		// Release active reservations for non-settled options; supersede those options (immutable history).
		_, err = tx.Exec(r.Context(), `
			UPDATE amount_reservations ar
			SET status='released'
			FROM payment_options po
			WHERE po.id = ar.payment_option_id
			  AND po.payment_intent_id=$1::uuid
			  AND po.status <> 'SETTLED'
			  AND ar.status='active'`, intentID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			UPDATE payment_options SET status='SUPERSEDED'
			WHERE payment_intent_id=$1::uuid AND status='ACTIVE'`, intentID)
		if err != nil {
			return err
		}

		var quoteID string
		err = tx.QueryRow(r.Context(), `
			INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at, metadata_json)
			VALUES ($1,$2,$3,$4::jsonb) RETURNING id::text`,
			quote.Rate.String(), quote.Source, quote.FetchedAt, rateQuoteMetadataJSON(quote)).Scan(&quoteID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			UPDATE payment_intents
			SET status=$2, quote_id=$3::uuid, expires_at=$4, updated_at=now()
			WHERE id=$1::uuid`, intentID, domain.StatusAwaitingPayment, quoteID, newExpires)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			UPDATE orders SET status=$2, updated_at=now() WHERE id=$1::uuid`, orderID, domain.StatusAwaitingPayment)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(r.Context(), `
			INSERT INTO payment_state_events (payment_intent_id, from_status, to_status, reason, actor)
			VALUES ($1::uuid,$2,$3,'quote refreshed','buyer')`, intentID, status, domain.StatusAwaitingPayment)

		created, err := s.insertPaymentOptions(r.Context(), tx, merchantID, intentID, baseUSDT, quote.Rate.String(), newExpires, nil)
		if err != nil {
			return err
		}
		if created == 0 {
			return errNoWallets
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errQuoteNotRefreshable) || errors.Is(err, errQuoteStillActive) {
			writeErr(w, http.StatusConflict, err.Error())
			return
		}
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	pay, err := s.loadPublicBySlug(r.Context(), slug)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "reload failed")
		return
	}
	writeJSON(w, http.StatusOK, pay)
}

func (s *Server) handlePublicSSE(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var intentID string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT pi.id::text FROM payment_intents pi
		JOIN orders o ON o.id = pi.order_id WHERE o.slug=$1`, slug).Scan(&intentID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	ch := s.Hub.Subscribe("intent:" + intentID)
	defer s.Hub.Unsubscribe("intent:"+intentID, ch)
	sse.WriteStream(w, r, ch)
}

func (s *Server) handleMerchantSSE(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ch := s.Hub.Subscribe("merchant:" + mid)
	defer s.Hub.Unsubscribe("merchant:"+mid, ch)
	sse.WriteStream(w, r, ch)
}

func (s *Server) handleSimulateChainEvent(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.EnableChainSimulator {
		writeErr(w, http.StatusForbidden, "simulator disabled")
		return
	}
	var ev domain.ChainEvent
	if err := decodeJSON(r, &ev); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid event")
		return
	}
	if ev.ObservedAt.IsZero() {
		ev.ObservedAt = nowUTC()
	}
	if ev.Confirmations == 0 {
		ev.Confirmations = 99
	}
	res, err := s.Matcher.Ingest(r.Context(), ev)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleSimulateConfirmations(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.EnableChainSimulator {
		writeErr(w, http.StatusForbidden, "simulator disabled")
		return
	}
	var req struct {
		EventID       string `json:"event_id"`
		Confirmations int    `json:"confirmations"`
	}
	if err := decodeJSON(r, &req); err != nil || req.EventID == "" {
		writeErr(w, http.StatusBadRequest, "event_id required")
		return
	}
	if err := s.Matcher.ApplyConfirmations(r.Context(), req.EventID, req.Confirmations); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

