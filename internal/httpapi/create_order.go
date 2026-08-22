package httpapi

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/payment"
)

const (
	orderSourcePWA             = "pwa"
	orderSourceInstagramDM     = "instagram_dm"
	orderSourceTelegramMiniapp = "telegram_miniapp"
)

// CreateOrderInput is the shared merchant order + intent path used by PWA,
// Instagram DM confirm, and Telegram Mini App.
type CreateOrderInput struct {
	MerchantID          string
	AmountUsdtBaseUnits int64
	FiatAmountToman     int64 // deprecated: legacy TMN alias
	Title             string
	Description       string
	MerchantReference string
	ExpiresInMinutes  int
	Fields            []domain.FieldDef
	Networks          []string
	CustomerID        string
	CreateIntent      bool
	ItemQuantity      int
	InternalNote      string
	SuccessMessage    string
	ImagePath         string
	Source            string
}

// CreatedOrder is the shared create result (checkout_url is always /p/{slug}).
type CreatedOrder struct {
	ID                  string
	Slug                string
	Title               string
	AmountUsdtBaseUnits int64
	FiatCurrency        string
	FiatAmount          int64 // deprecated mirror for legacy clients
	CheckoutURL         string
	PaymentIntent       map[string]any
}

func (s *Server) createOrderWithIntent(ctx context.Context, in CreateOrderInput) (CreatedOrder, error) {
	var out CreatedOrder
	usdtNative := in.AmountUsdtBaseUnits > 0
	if !usdtNative && in.FiatAmountToman <= 0 {
		return out, errAmountRequired
	}
	if usdtNative && in.FiatAmountToman > 0 {
		in.FiatAmountToman = 0
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = orderSourcePWA
	}

	var opStatus string
	if err := s.Pool.QueryRow(ctx, `SELECT operational_status FROM merchants WHERE id=$1::uuid`, in.MerchantID).Scan(&opStatus); err != nil {
		return out, err
	}
	if opStatus == "suspended" {
		return out, errMerchantSuspended
	}

	defaults, err := s.loadCheckoutDefaults(ctx, in.MerchantID)
	if err != nil {
		defaults = defaultCheckoutDefaults()
	}
	fields := in.Fields
	if len(fields) == 0 {
		fields = fieldDefsFromDefaults(defaults)
	}
	networks := in.Networks
	if len(networks) == 0 {
		networks = defaults.EnabledNetworks
	} else {
		networks = normalizeEnabledNetworks(networks, defaults.EnabledNetworks)
	}
	networks = s.filterCheckoutNetworks(ctx, networks)
	expiresMinutes := in.ExpiresInMinutes
	if expiresMinutes <= 0 {
		expiresMinutes = defaults.DefaultExpiryMinutes
	}

	slug, err := randomSlug(8)
	if err != nil {
		return out, err
	}
	var expiresAt *time.Time
	if expiresMinutes > 0 {
		t := time.Now().UTC().Add(time.Duration(expiresMinutes) * time.Minute)
		expiresAt = &t
	}

	var customerID *string
	if in.CustomerID != "" {
		var exists string
		err = s.Pool.QueryRow(ctx, `
			SELECT id::text FROM customers WHERE id=$1::uuid AND merchant_id=$2::uuid`,
			in.CustomerID, in.MerchantID).Scan(&exists)
		if err != nil {
			return out, errCustomerNotFound
		}
		customerID = &exists
	}

	qty := in.ItemQuantity
	if qty <= 0 {
		qty = 1
	}
	if qty > 10000 {
		qty = 10000
	}
	successMsg := strings.TrimSpace(in.SuccessMessage)
	if successMsg == "" {
		successMsg = defaults.SuccessMessage
	}

	fiatCur := "USDT"
	var fiatToman *int64
	var usdtBase *int64
	if usdtNative {
		usdtBase = &in.AmountUsdtBaseUnits
	} else {
		fiatCur = "TMN"
		fiatToman = &in.FiatAmountToman
	}

	var orderID string
	err = payment.WithTx(ctx, s.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			INSERT INTO orders (
				merchant_id, slug, title, description, merchant_reference,
				fiat_amount_toman, fiat_currency, amount_usdt_base_units, status, expires_at, customer_id, fulfillment_status,
				item_quantity, internal_note, success_message, image_path, source
			) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,'CREATED',$9,$10::uuid,'UNFULFILLED',$11,$12,$13,$14,$15)
			RETURNING id::text`,
			in.MerchantID, slug, in.Title, in.Description, in.MerchantReference, fiatToman, fiatCur, usdtBase, expiresAt, customerID,
			qty, strings.TrimSpace(in.InternalNote), successMsg, strings.TrimSpace(in.ImagePath), source).Scan(&orderID)
		if err != nil {
			return err
		}
		for i, f := range fields {
			opts := "[]"
			if len(f.Options) > 0 {
				b, _ := jsonMarshal(f.Options)
				opts = string(b)
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO order_field_definitions (order_id, field_key, label, field_type, required, options_json, sort_order)
				VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb,$7)`, orderID, f.Key, f.Label, f.Type, f.Required, opts, i)
			if err != nil {
				return err
			}
		}
		meta := map[string]any{"source": source, "fiat_currency": fiatCur}
		if usdtNative {
			meta["amount_usdt_base_units"] = in.AmountUsdtBaseUnits
		} else {
			meta["fiat_amount_toman"] = in.FiatAmountToman
		}
		return s.appendTimeline(ctx, tx, orderID, in.MerchantID, "order.created", "system", "Order created", in.Title, "merchant", meta)
	})
	if err != nil {
		return out, err
	}

	out = CreatedOrder{
		ID:                  orderID,
		Slug:                slug,
		Title:               in.Title,
		AmountUsdtBaseUnits: in.AmountUsdtBaseUnits,
		FiatCurrency:        fiatCur,
		FiatAmount:          in.FiatAmountToman,
		CheckoutURL:         strings.TrimRight(s.Cfg.PublicBaseURL, "/") + "/p/" + slug,
	}
	if usdtNative {
		out.FiatAmount = 0
	}
	if in.CreateIntent {
		intent, err := s.createPaymentIntentForOrder(ctx, in.MerchantID, orderID, networks)
		if err != nil {
			return out, err
		}
		out.PaymentIntent = intent
	}
	return out, nil
}
