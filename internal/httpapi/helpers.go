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

var errStaleRate = errors.New("exchange rate stale or unavailable")
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
	var id, slug, title, desc, ref, status string
	var amount int64
	var created time.Time
	err := s.Pool.QueryRow(ctx, `
		SELECT id::text, slug, title, description, merchant_reference, fiat_amount_toman, status, created_at
		FROM orders WHERE id=$1::uuid AND merchant_id=$2::uuid`, orderID, merchantID).
		Scan(&id, &slug, &title, &desc, &ref, &amount, &status, &created)
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
	}
	return map[string]any{
		"id": id, "slug": slug, "title": title, "description": desc, "merchant_reference": ref,
		"fiat_amount_toman": amount, "fiat_currency": "TMN", "status": status, "created_at": created,
		"checkout_url": s.Cfg.PublicBaseURL + "/p/" + slug,
		"fields": fields, "field_values": values, "payment_intent": intent,
	}, nil
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
		options = append(options, map[string]any{
			"id": oid, "network": network, "chain_id": chainID, "token_contract": token,
			"destination_address": dest,
			"base_usdt_amount": domain.FormatUSDTBaseUnits(baseAmt),
			"pay_usdt_amount": domain.FormatUSDTBaseUnits(payAmt),
			"pay_usdt_amount_base_units": payAmt,
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
	var orderID, merchantID, title, desc, storeName, status string
	var amount int64
	err := s.Pool.QueryRow(ctx, `
		SELECT o.id::text, o.merchant_id::text, o.title, o.description, o.fiat_amount_toman, o.status, m.name
		FROM orders o JOIN merchants m ON m.id = o.merchant_id
		WHERE o.slug=$1`, slug).Scan(&orderID, &merchantID, &title, &desc, &amount, &status, &storeName)
	if err != nil {
		return nil, err
	}
	fields := s.loadFieldDefs(ctx, orderID)
	values := s.loadFieldValues(ctx, orderID)
	var intentID string
	_ = s.Pool.QueryRow(ctx, `SELECT id::text FROM payment_intents WHERE order_id=$1::uuid`, orderID).Scan(&intentID)
	var intent map[string]any
	if intentID != "" {
		intent, _ = s.loadPaymentIntent(ctx, intentID)
	}
	return map[string]any{
		"slug": slug, "store_name": storeName, "title": title, "description": desc,
		"fiat_amount_toman": amount, "fiat_currency": "TMN", "status": status,
		"fields": fields, "field_values": values, "payment_intent": intent,
		"customer_submitted": len(values) > 0,
	}, nil
}

func fmtErr(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprint(err)
}
