package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/payment"
)

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var paidCount int
	var tomanVol int64
	var usdtBase int64
	var pending int
	var attention int
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*), COALESCE(SUM(o.fiat_amount_toman),0)
		FROM orders o
		JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid AND pi.status='PAID' AND pi.paid_at::date = CURRENT_DATE`, mid).Scan(&paidCount, &tomanVol)
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(po.pay_usdt_amount_base_units),0)
		FROM payment_options po
		JOIN payment_intents pi ON pi.id = po.payment_intent_id
		WHERE pi.merchant_id=$1::uuid AND pi.status='PAID' AND pi.paid_at::date = CURRENT_DATE AND po.status='SETTLED'`, mid).Scan(&usdtBase)
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM payment_intents
		WHERE merchant_id=$1::uuid AND status IN ('AWAITING_PAYMENT','SEEN','CONFIRMING')`, mid).Scan(&pending)
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid AND (
			COALESCE(pi.status, o.status) IN ('NEEDS_REVIEW','UNDERPAID','OVERPAID','LATE_PAYMENT','DUPLICATE_PAYMENT')
			OR (
				COALESCE(pi.status, o.status) = 'PAID'
				AND o.fulfillment_status IN ('UNFULFILLED','PROCESSING')
				AND COALESCE(pi.paid_at, o.updated_at) < now() - interval '24 hours'
			)
		)`, mid).Scan(&attention)

	rows, _ := s.Pool.Query(r.Context(), `
		SELECT o.id::text, o.slug, o.title, o.fiat_amount_toman, o.status, o.fulfillment_status,
		       COALESCE(pi.status, o.status) AS payment_status, o.created_at,
		       COALESCE((
		         SELECT ofv.value FROM order_field_values ofv
		         WHERE ofv.order_id = o.id AND ofv.field_key = 'full_name' LIMIT 1
		       ), '')
		FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid
		ORDER BY o.created_at DESC LIMIT 10`, mid)
	defer rows.Close()
	var recent []map[string]any
	for rows.Next() {
		var id, slug, title, status, fulfill, payStatus, customerName string
		var amount int64
		var created time.Time
		_ = rows.Scan(&id, &slug, &title, &amount, &status, &fulfill, &payStatus, &created, &customerName)
		recent = append(recent, map[string]any{
			"id": id, "slug": slug, "title": title, "fiat_amount_toman": amount,
			"status": status, "fulfillment_status": fulfill, "payment_status": payStatus,
			"customer_name": customerName, "created_at": created,
		})
	}
	if recent == nil {
		recent = []map[string]any{}
	}

	attnRows, _ := s.Pool.Query(r.Context(), `
		SELECT o.id::text, o.slug, o.title, o.fiat_amount_toman,
		       COALESCE(pi.status, o.status) AS payment_status, o.fulfillment_status, o.created_at,
		       CASE
		         WHEN COALESCE(pi.status, o.status) IN ('NEEDS_REVIEW','UNDERPAID','OVERPAID','LATE_PAYMENT','DUPLICATE_PAYMENT')
		           THEN COALESCE(pi.status, o.status)
		         ELSE 'PAID_UNFULFILLED'
		       END AS attention_reason
		FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid AND (
			COALESCE(pi.status, o.status) IN ('NEEDS_REVIEW','UNDERPAID','OVERPAID','LATE_PAYMENT','DUPLICATE_PAYMENT')
			OR (
				COALESCE(pi.status, o.status) = 'PAID'
				AND o.fulfillment_status IN ('UNFULFILLED','PROCESSING')
				AND COALESCE(pi.paid_at, o.updated_at) < now() - interval '24 hours'
			)
		)
		ORDER BY o.updated_at DESC LIMIT 20`, mid)
	defer attnRows.Close()
	var attentionItems []map[string]any
	for attnRows.Next() {
		var id, slug, title, payStatus, fulfill, reason string
		var amount int64
		var created time.Time
		_ = attnRows.Scan(&id, &slug, &title, &amount, &payStatus, &fulfill, &created, &reason)
		attentionItems = append(attentionItems, map[string]any{
			"id": id, "slug": slug, "title": title, "fiat_amount_toman": amount,
			"payment_status": payStatus, "fulfillment_status": fulfill,
			"reason": reason, "created_at": created,
		})
	}
	if attentionItems == nil {
		attentionItems = []map[string]any{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"today_paid_orders":   paidCount,
		"today_toman_volume":  tomanVol,
		"today_usdt_received": domain.FormatUSDTBaseUnits(usdtBase),
		"pending_payments":    pending,
		"needs_attention":     attention,
		"attention_items":     attentionItems,
		"recent_orders":       recent,
	})
}

func (s *Server) handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		FiatAmountToman   int64             `json:"fiat_amount_toman"`
		Title             string            `json:"title"`
		Description       string            `json:"description"`
		MerchantReference string            `json:"merchant_reference"`
		ExpiresInMinutes  int               `json:"expires_in_minutes"`
		Fields            []domain.FieldDef `json:"fields"`
		Networks          []string          `json:"networks"`
		CustomerID        string            `json:"customer_id"`
		CreateIntent      *bool             `json:"create_intent"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.FiatAmountToman <= 0 {
		writeErr(w, http.StatusBadRequest, "amount required")
		return
	}

	defaults, err := s.loadCheckoutDefaults(r.Context(), mid)
	if err != nil {
		defaults = defaultCheckoutDefaults()
	}
	if len(req.Fields) == 0 {
		req.Fields = fieldDefsFromDefaults(defaults)
	}
	if len(req.Networks) == 0 {
		req.Networks = defaults.EnabledNetworks
	} else {
		req.Networks = normalizeEnabledNetworks(req.Networks, defaults.EnabledNetworks)
	}
	expiresMinutes := req.ExpiresInMinutes
	if expiresMinutes <= 0 {
		expiresMinutes = defaults.DefaultExpiryMinutes
	}

	slug, err := randomSlug(8)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	var expiresAt *time.Time
	if expiresMinutes > 0 {
		t := time.Now().UTC().Add(time.Duration(expiresMinutes) * time.Minute)
		expiresAt = &t
	}

	var customerID *string
	if req.CustomerID != "" {
		var exists string
		err = s.Pool.QueryRow(r.Context(), `
			SELECT id::text FROM customers WHERE id=$1::uuid AND merchant_id=$2::uuid`,
			req.CustomerID, mid).Scan(&exists)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "customer not found")
			return
		}
		customerID = &exists
	}

	var orderID string
	err = payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			INSERT INTO orders (
				merchant_id, slug, title, description, merchant_reference,
				fiat_amount_toman, fiat_currency, status, expires_at, customer_id, fulfillment_status
			) VALUES ($1::uuid,$2,$3,$4,$5,$6,'TMN','CREATED',$7,$8::uuid,'UNFULFILLED') RETURNING id::text`,
			mid, slug, req.Title, req.Description, req.MerchantReference, req.FiatAmountToman, expiresAt, customerID).Scan(&orderID)
		if err != nil {
			return err
		}
		for i, f := range req.Fields {
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
		return s.appendTimeline(r.Context(), tx, orderID, mid, "order.created", "system", "Order created", req.Title, "merchant", map[string]any{
			"fiat_amount_toman": req.FiatAmountToman,
		})
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	createIntent := true
	if req.CreateIntent != nil {
		createIntent = *req.CreateIntent
	}
	resp := map[string]any{
		"id":           orderID,
		"slug":         slug,
		"title":        req.Title,
		"fiat_amount_toman": req.FiatAmountToman,
		"checkout_url": s.Cfg.PublicBaseURL + "/p/" + slug,
	}
	if createIntent {
		intent, err := s.createPaymentIntentForOrder(r.Context(), mid, orderID, req.Networks)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		resp["payment_intent"] = intent
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *Server) handleListOrders(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	filter := strings.TrimSpace(r.URL.Query().Get("filter"))
	args := []any{mid}
	sql := `
		SELECT o.id::text, o.slug, o.title, o.fiat_amount_toman, o.status, o.fulfillment_status, o.created_at,
		       COALESCE(pi.status, o.status) AS payment_status,
		       COALESCE((
		         SELECT ofv.value FROM order_field_values ofv
		         WHERE ofv.order_id = o.id AND ofv.field_key = 'full_name' LIMIT 1
		       ), ''),
		       COALESCE((
		         SELECT ofv.value FROM order_field_values ofv
		         WHERE ofv.order_id = o.id AND ofv.field_key = 'phone' LIMIT 1
		       ), '')
		FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid`
	argN := 2
	if q != "" {
		sql += ` AND (
			o.slug ILIKE $` + itoa(argN) + ` OR o.title ILIKE $` + itoa(argN) + ` OR o.merchant_reference ILIKE $` + itoa(argN) + `
			OR EXISTS (
			  SELECT 1 FROM order_field_values ofv
			  WHERE ofv.order_id = o.id
			    AND ofv.field_key IN ('full_name','phone','email')
			    AND ofv.value ILIKE $` + itoa(argN) + `
			)
		)`
		args = append(args, "%"+q+"%")
		argN++
	}
	if filter == "attention" {
		sql += ` AND (
			COALESCE(pi.status, o.status) IN ('NEEDS_REVIEW','UNDERPAID','OVERPAID','LATE_PAYMENT','DUPLICATE_PAYMENT')
			OR (
				COALESCE(pi.status, o.status) = 'PAID'
				AND o.fulfillment_status IN ('UNFULFILLED','PROCESSING')
				AND COALESCE(pi.paid_at, o.updated_at) < now() - interval '24 hours'
			)
		)`
	}
	sql += ` ORDER BY o.created_at DESC LIMIT 100`
	_ = argN
	rows, err := s.Pool.Query(r.Context(), sql, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, slug, title, status, fulfill, payStatus, customerName, phone string
		var amount int64
		var created time.Time
		_ = rows.Scan(&id, &slug, &title, &amount, &status, &fulfill, &created, &payStatus, &customerName, &phone)
		out = append(out, map[string]any{
			"id": id, "slug": slug, "title": title, "fiat_amount_toman": amount,
			"status": status, "fulfillment_status": fulfill, "payment_status": payStatus,
			"customer_name": customerName, "customer_phone": phone,
			"created_at": created, "checkout_url": s.Cfg.PublicBaseURL + "/p/" + slug,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"orders": out})
}

func (s *Server) handleGetOrder(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id := chi.URLParam(r, "id")
	order, err := s.loadOrderForMerchant(r.Context(), mid, id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, order)
}

func (s *Server) handleCreatePaymentIntent(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	orderID := chi.URLParam(r, "id")
	var req struct {
		Networks []string `json:"networks"`
	}
	_ = decodeJSON(r, &req)
	intent, err := s.createPaymentIntentForOrder(r.Context(), mid, orderID, req.Networks)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, intent)
}

func (s *Server) handleGetPaymentIntent(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id := chi.URLParam(r, "id")
	intent, err := s.loadPaymentIntent(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if intent["merchant_id"] != mid {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}
	writeJSON(w, http.StatusOK, intent)
}

func (s *Server) createPaymentIntentForOrder(ctx context.Context, merchantID, orderID string, networks []string) (map[string]any, error) {
	if len(networks) == 0 {
		networks = []string{domain.NetworkTRON, domain.NetworkBSC}
	}
	quote, err := s.Rates.FetchUSDTTmn(ctx)
	if err != nil {
		return nil, err
	}
	if time.Since(quote.FetchedAt) > s.Cfg.RateStale {
		return nil, errStaleRate
	}
	var toman int64
	var orderExpires *time.Time
	err = s.Pool.QueryRow(ctx, `
		SELECT fiat_amount_toman, expires_at FROM orders WHERE id=$1::uuid AND merchant_id=$2::uuid`,
		orderID, merchantID).Scan(&toman, &orderExpires)
	if err != nil {
		return nil, err
	}
	baseUSDT, err := payment.ComputeBaseUSDT(toman, quote.Rate)
	if err != nil {
		return nil, err
	}
	expires := time.Now().UTC().Add(s.Cfg.QuoteTTL)
	if orderExpires != nil && orderExpires.Before(expires) {
		expires = *orderExpires
	}

	var intentID string
	err = payment.WithTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var quoteID string
		err := tx.QueryRow(ctx, `
			INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at)
			VALUES ($1,$2,$3) RETURNING id::text`, quote.Rate.String(), quote.Source, quote.FetchedAt).Scan(&quoteID)
		if err != nil {
			return err
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, fiat_currency, status, quote_id, expires_at)
			VALUES ($1::uuid,$2::uuid,$3,'TMN',$4,$5::uuid,$6)
			ON CONFLICT (order_id) DO UPDATE SET updated_at=now()
			RETURNING id::text`, merchantID, orderID, toman, domain.StatusAwaitingPayment, quoteID, expires).Scan(&intentID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE orders SET status=$2, updated_at=now() WHERE id=$1::uuid`, orderID, domain.StatusAwaitingPayment)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `
			INSERT INTO payment_state_events (payment_intent_id, from_status, to_status, reason, actor)
			VALUES ($1::uuid,'CREATED',$2,'intent created','system')`, intentID, domain.StatusAwaitingPayment)

		createdOptions, err := s.insertPaymentOptions(ctx, tx, merchantID, intentID, baseUSDT, quote.Rate.String(), expires, networks)
		if err != nil {
			return err
		}
		if createdOptions == 0 {
			return errNoWallets
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.loadPaymentIntent(ctx, intentID)
}

// insertPaymentOptions creates ACTIVE options + unique reservations for merchant wallets.
// networks nil/empty means all configured networks (tron, bsc).
func (s *Server) insertPaymentOptions(
	ctx context.Context,
	tx pgx.Tx,
	merchantID, intentID string,
	baseUSDT int64,
	quoteRate string,
	expires time.Time,
	networks []string,
) (int, error) {
	if len(networks) == 0 {
		networks = []string{domain.NetworkTRON, domain.NetworkBSC}
	}
	created := 0
	for _, network := range networks {
		var walletAddr, walletNorm, contract string
		var chainID *int64
		err := tx.QueryRow(ctx, `
			SELECT address, address_normalized, contract_address, chain_id
			FROM merchant_wallet_addresses
			WHERE merchant_id=$1::uuid AND network=$2 AND is_active=true
			ORDER BY is_default DESC, created_at ASC LIMIT 1`, merchantID, network).
			Scan(&walletAddr, &walletNorm, &contract, &chainID)
		if err != nil {
			continue // skip network without wallet
		}
		var optionID string
		err = tx.QueryRow(ctx, `
			INSERT INTO payment_options (
				payment_intent_id, network, chain_id, token_contract, destination_address,
				destination_address_normalized, base_usdt_amount_base_units, pay_usdt_amount_base_units,
				quote_rate, expires_at, status
			) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$7,$8,$9,'ACTIVE') RETURNING id::text`,
			intentID, network, chainID, contract, walletAddr, walletNorm, baseUSDT, quoteRate, expires,
		).Scan(&optionID)
		if err != nil {
			return created, err
		}
		if _, err := payment.ClaimUniqueReservation(ctx, tx, optionID, walletNorm, network, contract, baseUSDT, expires, 48); err != nil {
			return created, err
		}
		created++
	}
	return created, nil
}
