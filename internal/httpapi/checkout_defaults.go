package httpapi

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/domain"
)

type checkoutDefaults struct {
	CustomerFields       map[string]string `json:"customer_fields"`
	EnabledNetworks      []string          `json:"enabled_networks"`
	DefaultNetwork       string            `json:"default_network"`
	DefaultExpiryMinutes int               `json:"default_expiry_minutes"`
	FulfillmentRequired  bool              `json:"fulfillment_required"`
	SuccessMessage       string            `json:"success_message"`
	CheckoutAccent       string            `json:"checkout_accent"`
}

var allowedCheckoutAccents = map[string]bool{
	"teal": true, "blue": true, "green": true, "amber": true, "rose": true, "slate": true,
}

func defaultCheckoutDefaults() checkoutDefaults {
	fields := make(map[string]string, len(domain.DefaultCustomerFieldModes))
	for k, v := range domain.DefaultCustomerFieldModes {
		fields[k] = v
	}
	return checkoutDefaults{
		CustomerFields:       fields,
		EnabledNetworks:      []string{domain.NetworkTRON, domain.NetworkBSC},
		DefaultNetwork:       domain.NetworkTRON,
		DefaultExpiryMinutes: 60,
		FulfillmentRequired:  true,
		SuccessMessage:       "",
		CheckoutAccent:       "teal",
	}
}

func (s *Server) ensureCheckoutDefaults(ctx context.Context, merchantID string) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO merchant_checkout_defaults (merchant_id)
		VALUES ($1::uuid)
		ON CONFLICT (merchant_id) DO NOTHING`, merchantID)
	return err
}

func (s *Server) loadCheckoutDefaults(ctx context.Context, merchantID string) (checkoutDefaults, error) {
	_ = s.ensureCheckoutDefaults(ctx, merchantID)
	var fieldsRaw []byte
	var networks []string
	var defNetwork string
	var expiry int
	var fulfillment bool
	var successMsg, accent string
	err := s.Pool.QueryRow(ctx, `
		SELECT customer_fields_json, enabled_networks, default_network,
		       default_expiry_minutes, fulfillment_required,
		       COALESCE(success_message,''), COALESCE(checkout_accent,'teal')
		FROM merchant_checkout_defaults WHERE merchant_id=$1::uuid`, merchantID).
		Scan(&fieldsRaw, &networks, &defNetwork, &expiry, &fulfillment, &successMsg, &accent)
	if err != nil {
		return defaultCheckoutDefaults(), err
	}
	out := defaultCheckoutDefaults()
	out.DefaultNetwork = defNetwork
	out.DefaultExpiryMinutes = expiry
	out.FulfillmentRequired = fulfillment
	out.SuccessMessage = successMsg
	if allowedCheckoutAccents[accent] {
		out.CheckoutAccent = accent
	}
	if len(networks) > 0 {
		out.EnabledNetworks = networks
	}
	var parsed map[string]string
	if err := json.Unmarshal(fieldsRaw, &parsed); err == nil && len(parsed) > 0 {
		for k, v := range parsed {
			mode := strings.ToLower(strings.TrimSpace(v))
			if mode == domain.FieldModeRequired || mode == domain.FieldModeOptional || mode == domain.FieldModeDisabled {
				out.CustomerFields[k] = mode
			}
		}
	}
	return out, nil
}

func fieldDefsFromDefaults(d checkoutDefaults) []domain.FieldDef {
	var out []domain.FieldDef
	for _, key := range domain.FieldKeyOrder {
		mode := d.CustomerFields[key]
		if mode == "" {
			mode = domain.DefaultCustomerFieldModes[key]
		}
		if mode == domain.FieldModeDisabled {
			continue
		}
		meta := domain.CheckoutFieldMeta[key]
		out = append(out, domain.FieldDef{
			Key:      key,
			Label:    meta.Label,
			Type:     meta.Type,
			Required: mode == domain.FieldModeRequired,
		})
	}
	if len(out) == 0 {
		return defaultCheckoutFields()
	}
	return out
}

func normalizeEnabledNetworks(in []string, fallback []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, n := range in {
		n = strings.ToLower(strings.TrimSpace(n))
		if n != domain.NetworkTRON && n != domain.NetworkBSC {
			continue
		}
		if seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	if len(out) == 0 {
		return fallback
	}
	return out
}

// filterCheckoutNetworks intersects merchant-requested networks with server policy
// (e.g. ENABLE_BSC_CHECKOUT=false hides BNB Chain until ready).
func (s *Server) filterCheckoutNetworks(in []string) []string {
	allowed := map[string]bool{}
	for _, n := range s.Cfg.CheckoutNetworks() {
		allowed[n] = true
	}
	var out []string
	for _, n := range in {
		if allowed[n] {
			out = append(out, n)
		}
	}
	if len(out) == 0 {
		return s.Cfg.CheckoutNetworks()
	}
	return out
}

func (s *Server) saveCheckoutDefaults(ctx context.Context, merchantID string, d checkoutDefaults) error {
	if err := s.ensureCheckoutDefaults(ctx, merchantID); err != nil {
		return err
	}
	fields := d.CustomerFields
	if fields == nil {
		fields = domain.DefaultCustomerFieldModes
	}
	// Keep only known keys with valid modes.
	clean := map[string]string{}
	for _, key := range domain.FieldKeyOrder {
		mode := strings.ToLower(strings.TrimSpace(fields[key]))
		if mode != domain.FieldModeRequired && mode != domain.FieldModeOptional && mode != domain.FieldModeDisabled {
			mode = domain.DefaultCustomerFieldModes[key]
		}
		clean[key] = mode
	}
	b, err := json.Marshal(clean)
	if err != nil {
		return err
	}
	networks := normalizeEnabledNetworks(d.EnabledNetworks, []string{domain.NetworkTRON, domain.NetworkBSC})
	defNet := strings.ToLower(strings.TrimSpace(d.DefaultNetwork))
	if defNet != domain.NetworkTRON && defNet != domain.NetworkBSC {
		defNet = domain.NetworkTRON
	}
	// Default network must be enabled.
	enabled := false
	for _, n := range networks {
		if n == defNet {
			enabled = true
			break
		}
	}
	if !enabled {
		defNet = networks[0]
	}
	expiry := d.DefaultExpiryMinutes
	if expiry <= 0 {
		expiry = 60
	}
	if expiry > 10080 {
		expiry = 10080
	}
	accent := strings.ToLower(strings.TrimSpace(d.CheckoutAccent))
	if !allowedCheckoutAccents[accent] {
		accent = "teal"
	}
	success := strings.TrimSpace(d.SuccessMessage)
	if len(success) > 280 {
		success = success[:280]
	}
	_, err = s.Pool.Exec(ctx, `
		UPDATE merchant_checkout_defaults SET
			customer_fields_json=$2::jsonb,
			enabled_networks=$3,
			default_network=$4,
			default_expiry_minutes=$5,
			fulfillment_required=$6,
			success_message=$7,
			checkout_accent=$8,
			updated_at=now()
		WHERE merchant_id=$1::uuid`,
		merchantID, string(b), networks, defNet, expiry, d.FulfillmentRequired, success, accent)
	return err
}

func (s *Server) appendTimeline(ctx context.Context, tx pgx.Tx, orderID, merchantID, eventType, source, title, detail, actor string, meta map[string]any) error {
	if meta == nil {
		meta = map[string]any{}
	}
	b, _ := json.Marshal(meta)
	q := `
		INSERT INTO order_timeline_events (order_id, merchant_id, event_type, source, title, detail, metadata_json, actor)
		VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::jsonb,$8)`
	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, q, orderID, merchantID, eventType, source, title, detail, string(b), actor)
	} else {
		_, err = s.Pool.Exec(ctx, q, orderID, merchantID, eventType, source, title, detail, string(b), actor)
	}
	return err
}
