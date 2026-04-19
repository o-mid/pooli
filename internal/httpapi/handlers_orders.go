package httpapi

import (
	"context"
	"net/http"
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

	rows, _ := s.Pool.Query(r.Context(), `
		SELECT id::text, slug, title, fiat_amount_toman, status, created_at
		FROM orders WHERE merchant_id=$1::uuid ORDER BY created_at DESC LIMIT 10`, mid)
	defer rows.Close()
	var recent []map[string]any
	for rows.Next() {
		var id, slug, title, status string
		var amount int64
		var created time.Time
		_ = rows.Scan(&id, &slug, &title, &amount, &status, &created)
		recent = append(recent, map[string]any{
			"id": id, "slug": slug, "title": title, "fiat_amount_toman": amount, "status": status, "created_at": created,
		})
	}
	if recent == nil {
		recent = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"today_paid_orders": paidCount,
		"today_toman_volume": tomanVol,
		"today_usdt_received": domain.FormatUSDTBaseUnits(usdtBase),
		"pending_payments": pending,
		"recent_orders": recent,
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
	if len(req.Fields) == 0 {
		req.Fields = defaultCheckoutFields()
	}
	slug, err := randomSlug(8)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	var expiresAt *time.Time
	if req.ExpiresInMinutes > 0 {
		t := time.Now().UTC().Add(time.Duration(req.ExpiresInMinutes) * time.Minute)
		expiresAt = &t
	}
	var orderID string
	err = payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			INSERT INTO orders (merchant_id, slug, title, description, merchant_reference, fiat_amount_toman, fiat_currency, status, expires_at)
			VALUES ($1::uuid,$2,$3,$4,$5,$6,'TMN','CREATED',$7) RETURNING id::text`,
			mid, slug, req.Title, req.Description, req.MerchantReference, req.FiatAmountToman, expiresAt).Scan(&orderID)
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
		return nil
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
		"id": orderID,
		"slug": slug,
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
	rows, err := s.Pool.Query(r.Context(), `
		SELECT o.id::text, o.slug, o.title, o.fiat_amount_toman, o.status, o.created_at,
		       COALESCE(pi.status, o.status) AS payment_status
		FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.merchant_id=$1::uuid
		ORDER BY o.created_at DESC LIMIT 100`, mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, slug, title, status, payStatus string
		var amount int64
		var created time.Time
		_ = rows.Scan(&id, &slug, &title, &amount, &status, &created, &payStatus)
		out = append(out, map[string]any{
			"id": id, "slug": slug, "title": title, "fiat_amount_toman": amount,
			"status": status, "payment_status": payStatus, "created_at": created,
			"checkout_url": s.Cfg.PublicBaseURL + "/p/" + slug,
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

		createdOptions := 0
		for _, network := range networks {
			adapter := s.adapterFor(network)
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
				intentID, network, chainID, contract, walletAddr, walletNorm, baseUSDT, quote.Rate.String(), expires,
			).Scan(&optionID)
			if err != nil {
				return err
			}
			if _, err := payment.ClaimUniqueReservation(ctx, tx, optionID, walletNorm, network, contract, baseUSDT, expires, 48); err != nil {
				return err
			}
			createdOptions++
			_ = adapter
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
