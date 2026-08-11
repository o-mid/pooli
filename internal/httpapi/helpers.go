package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
)

var errStaleRate = errors.New("We can't get the current USDT rate right now. Please try again shortly.")
var errNoWallets = errors.New("add at least one active wallet before creating a payment link")

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

func randomSlug(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b)[:n], nil
}

func defaultCheckoutFields() []domain.FieldDef {
	return []domain.FieldDef{
		{Key: "full_name", Label: "Full name", Type: "text", Required: true},
		{Key: "phone", Label: "Phone", Type: "phone", Required: true},
		{Key: "shipping_address", Label: "Shipping address", Type: "textarea", Required: true},
		{Key: "postal_code", Label: "Postal code", Type: "text", Required: false},
	}
}

func (s *Server) loadOrderForMerchant(ctx context.Context, merchantID, orderID string) (map[string]any, error) {
	var id, slug, title, desc, ref, status, fulfill, shipProvider, tracking, fulfillNote string
	var amount int64
	var created time.Time
	var customerID *string
	var shippedAt, deliveredAt *time.Time
	err := s.Pool.QueryRow(ctx, `
		SELECT id::text, slug, title, description, merchant_reference, fiat_amount_toman, status, created_at,
		       customer_id::text, fulfillment_status, shipping_provider, tracking_number,
		       shipped_at, delivered_at, fulfillment_note
		FROM orders WHERE id=$1::uuid AND merchant_id=$2::uuid`, orderID, merchantID).
		Scan(&id, &slug, &title, &desc, &ref, &amount, &status, &created,
			&customerID, &fulfill, &shipProvider, &tracking, &shippedAt, &deliveredAt, &fulfillNote)
	if err != nil {
		return nil, err
	}
	fields := s.loadFieldDefs(ctx, id)
	values := s.loadFieldValues(ctx, id)
	var intent map[string]any
	var intentID string
	_ = s.Pool.QueryRow(ctx, `SELECT id::text FROM payment_intents WHERE order_id=$1::uuid`, id).Scan(&intentID)
	if intentID != "" {
		intent, _ = s.loadPaymentIntent(ctx, intentID)
		if intent != nil {
			s.attachMatchedTx(ctx, intent)
		}
	}
	timeline := s.loadTimeline(ctx, merchantID, id)
	receipt := s.buildReceipt(ctx, id, intent)
	out := map[string]any{
		"id": id, "slug": slug, "title": title, "description": desc, "merchant_reference": ref,
		"fiat_amount_toman": amount, "fiat_currency": "TMN", "status": status, "created_at": created,
		"checkout_url": s.Cfg.PublicBaseURL + "/p/" + slug,
		"fields": fields, "field_values": values, "payment_intent": intent,
		"customer_id": customerID, "fulfillment_status": fulfill,
		"shipping_provider": shipProvider, "tracking_number": tracking,
		"shipped_at": shippedAt, "delivered_at": deliveredAt, "fulfillment_note": fulfillNote,
		"timeline": timeline, "receipt": receipt,
	}
	return out, nil
}

func (s *Server) loadFieldDefs(ctx context.Context, orderID string) []map[string]any {
	rows, err := s.Pool.Query(ctx, `
		SELECT field_key, label, field_type, required, options_json, sort_order
		FROM order_field_definitions WHERE order_id=$1::uuid ORDER BY sort_order`, orderID)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var key, label, ftype string
		var required bool
		var opts []byte
		var sort int
		_ = rows.Scan(&key, &label, &ftype, &required, &opts, &sort)
		var options []string
		_ = json.Unmarshal(opts, &options)
		out = append(out, map[string]any{
			"key": key, "label": label, "type": ftype, "required": required, "options": options,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out
}

func (s *Server) loadFieldValues(ctx context.Context, orderID string) []map[string]any {
	rows, err := s.Pool.Query(ctx, `
		SELECT field_key, label, field_type, value FROM order_field_values WHERE order_id=$1::uuid`, orderID)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var key, label, ftype, value string
		_ = rows.Scan(&key, &label, &ftype, &value)
		out = append(out, map[string]any{"key": key, "label": label, "type": ftype, "value": value})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out
}

func (s *Server) loadPaymentIntent(ctx context.Context, intentID string) (map[string]any, error) {
	var id, merchantID, orderID, status, fiatCurrency string
	var toman int64
	var expires, created time.Time
	var paidAt *time.Time
	err := s.Pool.QueryRow(ctx, `
		SELECT id::text, merchant_id::text, order_id::text, fiat_amount_toman, fiat_currency, status, expires_at, paid_at, created_at
		FROM payment_intents WHERE id=$1::uuid`, intentID).
		Scan(&id, &merchantID, &orderID, &toman, &fiatCurrency, &status, &expires, &paidAt, &created)
	if err != nil {
		return nil, err
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT id::text, network, chain_id, token_contract, destination_address,
		       base_usdt_amount_base_units, pay_usdt_amount_base_units, quote_rate::text, expires_at, status
		FROM payment_options WHERE payment_intent_id=$1::uuid`, intentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var options []map[string]any
	for rows.Next() {
		var oid, network, token, dest, quoteRate, optStatus string
		var chainID *int64
		var baseAmt, payAmt int64
		var optExpires time.Time
		_ = rows.Scan(&oid, &network, &chainID, &token, &dest, &baseAmt, &payAmt, &quoteRate, &optExpires, &optStatus)
		handoff := ""
		if adapter := s.adapterFor(network); adapter != nil {
			handoff = adapter.BuildPaymentHandoff(dest, payAmt, token)
		}
		asset, decimals := s.optionAssetMeta(network)
		options = append(options, map[string]any{
			"id": oid, "network": network, "chain_id": chainID, "token_contract": token,
			"destination_address": dest,
			"base_usdt_amount": domain.FormatUSDTBaseUnits(baseAmt),
			"pay_usdt_amount": domain.FormatUSDTBaseUnits(payAmt),
			"pay_usdt_amount_base_units": payAmt,
			"asset": asset, "token_decimals": decimals,
			"quote_rate": quoteRate, "expires_at": optExpires, "status": optStatus,
			"payment_uri": handoff,
		})
	}
	if options == nil {
		options = []map[string]any{}
	}
	if len(options) == 0 && status == domain.StatusAwaitingPayment {
		// leave empty; caller may surface configuration error
	}
	return map[string]any{
		"id": id, "merchant_id": merchantID, "order_id": orderID,
		"fiat_amount_toman": toman, "fiat_currency": fiatCurrency, "status": status,
		"expires_at": expires, "paid_at": paidAt, "created_at": created, "options": options,
	}, nil
}

func (s *Server) loadPublicBySlug(ctx context.Context, slug string) (map[string]any, error) {
	var orderID, merchantID, title, desc, storeName, logoPath, status, fulfill, shipProvider, tracking string
	var amount int64
	var support string
	var emailVerified, phoneVerified bool
	var walletConfigured bool
	var shippedAt *time.Time
	err := s.Pool.QueryRow(ctx, `
		SELECT o.id::text, o.merchant_id::text, o.title, o.description, o.fiat_amount_toman, o.status,
		       COALESCE(NULLIF(m.display_name,''), m.name), COALESCE(m.logo_path,''), COALESCE(m.support_contact,''),
		       o.fulfillment_status, o.shipping_provider, o.tracking_number, o.shipped_at,
		       EXISTS (
		         SELECT 1 FROM merchant_users mu
		         JOIN users u ON u.id = mu.user_id
		         WHERE mu.merchant_id = m.id AND u.email_verified_at IS NOT NULL
		       ),
		       EXISTS (
		         SELECT 1 FROM merchant_users mu
		         JOIN users u ON u.id = mu.user_id
		         WHERE mu.merchant_id = m.id AND u.phone_verified_at IS NOT NULL
		       ),
		       EXISTS (
		         SELECT 1 FROM merchant_wallet_addresses w
		         WHERE w.merchant_id = m.id AND w.is_active = true
		       )
		FROM orders o JOIN merchants m ON m.id = o.merchant_id
		WHERE o.slug=$1`, slug).Scan(
		&orderID, &merchantID, &title, &desc, &amount, &status, &storeName, &logoPath, &support,
		&fulfill, &shipProvider, &tracking, &shippedAt,
		&emailVerified, &phoneVerified, &walletConfigured,
	)
	if err != nil {
		return nil, err
	}
	fields := s.loadFieldDefs(ctx, orderID)
	values := s.loadFieldValues(ctx, orderID)
	// Public responses must not echo full submitted customer PII after submit.
	publicValues := []map[string]any{}
	var intentID string
	_ = s.Pool.QueryRow(ctx, `SELECT id::text FROM payment_intents WHERE order_id=$1::uuid`, orderID).Scan(&intentID)
	var intent map[string]any
	if intentID != "" {
		intent, _ = s.loadPaymentIntent(ctx, intentID)
		if intent != nil {
			s.attachMatchedTx(ctx, intent)
		}
	}
	logoURL := ""
	if logoPath != "" {
		logoURL = "/api/v1/public/uploads/" + logoPath
	}
	receipt := s.buildReceipt(ctx, orderID, intent)
	timeline := s.loadTimelinePublic(ctx, orderID)
	return map[string]any{
		"slug": slug, "store_name": storeName, "store_logo_url": logoURL, "title": title, "description": desc,
		"fiat_amount_toman": amount, "fiat_currency": "TMN", "status": status,
		"fields": fields, "field_values": publicValues, "payment_intent": intent,
		"customer_submitted": len(values) > 0,
		"fulfillment_status": fulfill, "shipping_provider": shipProvider,
		"tracking_number": tracking, "shipped_at": shippedAt,
		"timeline": timeline, "receipt": receipt,
		"enabled_networks": s.Cfg.CheckoutNetworks(),
		"trust": map[string]any{
			"email_verified":    emailVerified,
			"phone_verified":    phoneVerified,
			"wallet_configured": walletConfigured,
			"support_contact":   support,
		},
		// OG-safe preview fields (no customer PII, no amount by default).
		"preview": map[string]any{
			"store_name": storeName, "title": title, "store_logo_url": logoURL,
		},
	}, nil
}

func (s *Server) buildReceipt(ctx context.Context, orderID string, intent map[string]any) map[string]any {
	if intent == nil {
		return nil
	}
	status, _ := intent["status"].(string)
	if status != domain.StatusPaid && status != domain.StatusLatePayment {
		return nil
	}
	var storeName, title, slug string
	var toman int64
	_ = s.Pool.QueryRow(ctx, `
		SELECT COALESCE(NULLIF(m.display_name,''), m.name), o.title, o.slug, o.fiat_amount_toman
		FROM orders o JOIN merchants m ON m.id = o.merchant_id
		WHERE o.id=$1::uuid`, orderID).Scan(&storeName, &title, &slug, &toman)

	var payUSDT string
	var receivedUSDT string
	var network, dest string
	var paidAt any
	paidAt = intent["paid_at"]
	if opts, ok := intent["options"].([]map[string]any); ok {
		for _, opt := range opts {
			st, _ := opt["status"].(string)
			if st == "SETTLED" || st == "MATCHED" {
				payUSDT, _ = opt["pay_usdt_amount"].(string)
				network, _ = opt["network"].(string)
				dest, _ = opt["destination_address"].(string)
				break
			}
		}
		if payUSDT == "" && len(opts) > 0 {
			payUSDT, _ = opts[0]["pay_usdt_amount"].(string)
			network, _ = opts[0]["network"].(string)
			dest, _ = opts[0]["destination_address"].(string)
		}
	} else if optsAny, ok := intent["options"].([]any); ok {
		for _, raw := range optsAny {
			opt, _ := raw.(map[string]any)
			if opt == nil {
				continue
			}
			st, _ := opt["status"].(string)
			if st == "SETTLED" || st == "MATCHED" || payUSDT == "" {
				payUSDT, _ = opt["pay_usdt_amount"].(string)
				network, _ = opt["network"].(string)
				dest, _ = opt["destination_address"].(string)
				if st == "SETTLED" || st == "MATCHED" {
					break
				}
			}
		}
	}

	var txHash, explorer string
	var confirmations, required int
	if matched, ok := intent["matched_tx"].(map[string]any); ok && matched != nil {
		txHash, _ = matched["tx_hash"].(string)
		explorer, _ = matched["explorer_url"].(string)
		if v, ok := matched["confirmations"].(int); ok {
			confirmations = v
		}
		if v, ok := matched["required_confirmations"].(int); ok {
			required = v
		}
		if n, ok := matched["network"].(string); ok && n != "" {
			network = n
		}
		// Actual received amount from chain event when available.
		var amt int64
		_ = s.Pool.QueryRow(ctx, `
			SELECT ce.amount_base_units FROM matched_transactions mt
			JOIN chain_events ce ON ce.id = mt.chain_event_id
			WHERE mt.payment_intent_id=$1::uuid
			ORDER BY mt.created_at DESC LIMIT 1`, intent["id"]).Scan(&amt)
		if amt > 0 {
			receivedUSDT = domain.FormatUSDTBaseUnits(amt)
		}
	}
	if receivedUSDT == "" {
		receivedUSDT = payUSDT
	}

	return map[string]any{
		"merchant":              storeName,
		"order_title":           title,
		"order_reference":       slug,
		"order_id":              orderID,
		"fiat_amount_toman":     toman,
		"fiat_currency":         "TMN",
		"usdt_amount":           payUSDT,
		"received_usdt_amount":  receivedUSDT,
		"network":               network,
		"destination_address":   dest,
		"tx_hash":               txHash,
		"explorer_url":          explorer,
		"confirmations":         confirmations,
		"required_confirmations": required,
		"paid_at":               paidAt,
		"payment_status":        status,
	}
}

func (s *Server) attachMatchedTx(ctx context.Context, intent map[string]any) {
	intentID, _ := intent["id"].(string)
	if intentID == "" {
		return
	}
	var txHash, network string
	var confirmations int
	err := s.Pool.QueryRow(ctx, `
		SELECT ce.tx_hash, ce.network, ce.confirmations
		FROM matched_transactions mt
		JOIN chain_events ce ON ce.id = mt.chain_event_id
		WHERE mt.payment_intent_id=$1::uuid
		  AND mt.match_type IN ('EXACT', 'LATE_PAYMENT')
		ORDER BY CASE mt.match_type WHEN 'EXACT' THEN 0 ELSE 1 END, mt.created_at DESC
		LIMIT 1`, intentID).Scan(&txHash, &network, &confirmations)
	if err != nil {
		return
	}
	required := s.Cfg.TronConfirmations
	if network == "bsc" {
		required = s.Cfg.BSCConfirmations
	}
	intent["matched_tx"] = map[string]any{
		"tx_hash":                txHash,
		"network":                network,
		"confirmations":          confirmations,
		"required_confirmations": required,
		"explorer_url":           s.Cfg.ExplorerTxURL(network, txHash),
	}
}

func fmtErr(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprint(err)
}

func rateQuoteMetadataJSON(q domain.RateQuote) string {
	b, err := json.Marshal(map[string]any{
		"policy":           q.Policy,
		"source_pair":      q.SourcePair,
		"source_currency":  q.SourceCurrency,
		"display_currency": q.DisplayCurrency,
		"provider":         q.Source,
	})
	if err != nil {
		return "{}"
	}
	return string(b)
}

// optionAssetMeta returns configured asset identity for checkout handoff.
// Does not enable unknown assets — currently USDT only.
func (s *Server) optionAssetMeta(network string) (asset string, decimals int) {
	asset = domain.AssetUSDT
	decimals = domain.USDTDecimals
	if network == domain.NetworkBSC {
		decimals = s.Cfg.BSCUSDTDecimals
		if decimals <= 0 {
			decimals = 18
		}
	}
	return asset, decimals
}

// pickOptionByNetwork prefers ACTIVE options for the given network.
func pickOptionByNetwork(options any, network string) map[string]any {
	var list []map[string]any
	switch options := options.(type) {
	case []map[string]any:
		list = options
	case []any:
		for _, raw := range options {
			if opt, ok := raw.(map[string]any); ok {
				list = append(list, opt)
			}
		}
	}
	var fallback map[string]any
	for _, opt := range list {
		if opt["network"] != network {
			continue
		}
		if opt["status"] == "ACTIVE" || opt["status"] == "" || opt["status"] == nil {
			return opt
		}
		if fallback == nil {
			fallback = opt
		}
	}
	return fallback
}
