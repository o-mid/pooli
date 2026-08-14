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

	analytics := s.loadHomeAnalytics(r.Context(), mid)

	resp := map[string]any{
		"today_paid_orders":   paidCount,
		"today_toman_volume":  tomanVol,
		"today_usdt_received": domain.FormatUSDTBaseUnits(usdtBase),
		"pending_payments":    pending,
		"needs_attention":     attention,
		"attention_items":     attentionItems,
		"recent_orders":       recent,
		"analytics":           analytics,
	}
	var linkSlug, linkTitle string
	var linkAmount int64
	err = s.Pool.QueryRow(r.Context(), `
		SELECT slug, title, fiat_amount_toman FROM payment_links
		WHERE merchant_id=$1::uuid AND active=true
		ORDER BY created_at ASC LIMIT 1`, mid).Scan(&linkSlug, &linkTitle, &linkAmount)
	if err == nil && linkSlug != "" {
		resp["payment_link"] = map[string]any{
			"slug":              linkSlug,
			"title":             linkTitle,
			"fiat_amount_toman": linkAmount,
			"url":               strings.TrimRight(s.Cfg.PublicBaseURL, "/") + "/link/" + linkSlug,
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

// loadHomeAnalytics returns only metrics that can be computed from existing rows.
// No placeholder conversion percentages.
func (s *Server) loadHomeAnalytics(ctx context.Context, merchantID string) map[string]any {
	var gmv7d int64
	var paid7d int
	_ = s.Pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(o.fiat_amount_toman),0), COUNT(*)
		FROM orders o
		JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid AND pi.status='PAID' AND pi.paid_at >= now() - interval '7 days'`,
		merchantID).Scan(&gmv7d, &paid7d)
	aov := int64(0)
	if paid7d > 0 {
		aov = gmv7d / int64(paid7d)
	}
	var expired7d, created7d int
	_ = s.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM payment_intents
		WHERE merchant_id=$1::uuid AND status='EXPIRED' AND created_at >= now() - interval '7 days'`,
		merchantID).Scan(&expired7d)
	_ = s.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM payment_intents
		WHERE merchant_id=$1::uuid AND created_at >= now() - interval '7 days'`,
		merchantID).Scan(&created7d)

	rows, err := s.Pool.Query(ctx, `
		SELECT po.network, COUNT(*)
		FROM payment_options po
		JOIN payment_intents pi ON pi.id = po.payment_intent_id
		WHERE pi.merchant_id=$1::uuid AND pi.status='PAID' AND po.status='SETTLED'
		  AND pi.paid_at >= now() - interval '30 days'
		GROUP BY po.network`, merchantID)
	networkMix := map[string]int{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var net string
			var n int
			_ = rows.Scan(&net, &n)
			networkMix[net] = n
		}
	}

	// Detection / confirm latency from payment_state_events when present.
	var avgDetectSec, avgConfirmSec *float64
	_ = s.Pool.QueryRow(ctx, `
		SELECT AVG(EXTRACT(EPOCH FROM (seen_at.created_at - created_at.created_at)))
		FROM payment_state_events seen_at
		JOIN payment_state_events created_at
		  ON created_at.payment_intent_id = seen_at.payment_intent_id
		 AND created_at.to_status = 'AWAITING_PAYMENT'
		JOIN payment_intents pi ON pi.id = seen_at.payment_intent_id
		WHERE pi.merchant_id=$1::uuid
		  AND seen_at.to_status = 'SEEN'
		  AND seen_at.created_at >= now() - interval '30 days'`, merchantID).Scan(&avgDetectSec)
	_ = s.Pool.QueryRow(ctx, `
		SELECT AVG(EXTRACT(EPOCH FROM (paid_at.created_at - seen_at.created_at)))
		FROM payment_state_events paid_at
		JOIN payment_state_events seen_at
		  ON seen_at.payment_intent_id = paid_at.payment_intent_id
		 AND seen_at.to_status IN ('SEEN','CONFIRMING')
		JOIN payment_intents pi ON pi.id = paid_at.payment_intent_id
		WHERE pi.merchant_id=$1::uuid
		  AND paid_at.to_status = 'PAID'
		  AND paid_at.created_at >= now() - interval '30 days'`, merchantID).Scan(&avgConfirmSec)

	var recentCustomers []map[string]any
	crows, err := s.Pool.Query(ctx, `
		SELECT id::text, full_name, lifetime_paid_toman, last_order_at
		FROM customers WHERE merchant_id=$1::uuid
		ORDER BY COALESCE(last_order_at, updated_at) DESC LIMIT 5`, merchantID)
	if err == nil {
		defer crows.Close()
		for crows.Next() {
			var id, name string
			var life int64
			var last *time.Time
			_ = crows.Scan(&id, &name, &life, &last)
			recentCustomers = append(recentCustomers, map[string]any{
				"id": id, "full_name": name, "lifetime_paid_toman": life, "last_order_at": last,
			})
		}
	}
	if recentCustomers == nil {
		recentCustomers = []map[string]any{}
	}

	out := map[string]any{
		"window_days":            7,
		"gmv_toman_7d":           gmv7d,
		"paid_orders_7d":         paid7d,
		"average_order_value_7d": aov,
		"intents_created_7d":     created7d,
		"intents_expired_7d":     expired7d,
		"network_mix_30d":        networkMix,
		"recent_customers":       recentCustomers,
		// Explicit: checkout conversion deferred until session funnel exists.
		"checkout_conversion": nil,
		"definitions": map[string]string{
			"gmv_toman_7d":           "Sum of fiat_amount_toman on orders with PAID intents in last 7 days",
			"average_order_value_7d": "gmv_toman_7d / paid_orders_7d",
			"network_mix_30d":        "Count of SETTLED payment_options by network for PAID intents in 30 days",
			"checkout_conversion":    "Not available — checkout session funnel not stored yet",
		},
	}
	if avgDetectSec != nil {
		out["avg_detection_seconds_30d"] = *avgDetectSec
	}
	if avgConfirmSec != nil {
		out["avg_confirm_seconds_30d"] = *avgConfirmSec
	}
	return out
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
		ItemQuantity      int               `json:"item_quantity"`
		InternalNote      string            `json:"internal_note"`
		SuccessMessage    string            `json:"success_message"`
		ImagePath         string            `json:"image_path"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	createIntent := true
	if req.CreateIntent != nil {
		createIntent = *req.CreateIntent
	}
	created, err := s.createOrderWithIntent(r.Context(), CreateOrderInput{
		MerchantID:        mid,
		FiatAmountToman:   req.FiatAmountToman,
		Title:             req.Title,
		Description:       req.Description,
		MerchantReference: req.MerchantReference,
		ExpiresInMinutes:  req.ExpiresInMinutes,
		Fields:            req.Fields,
		Networks:          req.Networks,
		CustomerID:        req.CustomerID,
		CreateIntent:      createIntent,
		ItemQuantity:      req.ItemQuantity,
		InternalNote:      req.InternalNote,
		SuccessMessage:    req.SuccessMessage,
		ImagePath:         req.ImagePath,
		Source:            orderSourcePWA,
	})
	if err != nil {
		if err == errAmountRequired {
			writeErr(w, http.StatusBadRequest, "amount required")
			return
		}
		if err == errMerchantSuspended {
			writeErr(w, http.StatusForbidden, err.Error())
			return
		}
		if err == errCustomerNotFound {
			writeErr(w, http.StatusBadRequest, "customer not found")
			return
		}
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	resp := map[string]any{
		"id":                created.ID,
		"slug":              created.Slug,
		"title":             created.Title,
		"fiat_amount_toman": created.FiatAmount,
		"checkout_url":      created.CheckoutURL,
	}
	if created.PaymentIntent != nil {
		resp["payment_intent"] = created.PaymentIntent
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
		networks = s.Cfg.CheckoutNetworks()
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
			INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at, metadata_json)
			VALUES ($1,$2,$3,$4::jsonb) RETURNING id::text`,
			quote.Rate.String(), quote.Source, quote.FetchedAt, rateQuoteMetadataJSON(quote)).Scan(&quoteID)
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
		networks = s.Cfg.CheckoutNetworks()
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
