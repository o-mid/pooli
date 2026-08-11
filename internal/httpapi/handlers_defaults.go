package httpapi

import (
	"net/http"
	"strings"

	"github.com/pooli-shop/pooli/internal/domain"
)

func (s *Server) handleGetCheckoutDefaults(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	d, err := s.loadCheckoutDefaults(r.Context(), mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (s *Server) handlePatchCheckoutDefaults(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		CustomerFields       map[string]string `json:"customer_fields"`
		EnabledNetworks      []string          `json:"enabled_networks"`
		DefaultNetwork       *string           `json:"default_network"`
		DefaultExpiryMinutes *int              `json:"default_expiry_minutes"`
		FulfillmentRequired  *bool             `json:"fulfillment_required"`
		SuccessMessage       *string           `json:"success_message"`
		CheckoutAccent       *string           `json:"checkout_accent"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	cur, err := s.loadCheckoutDefaults(r.Context(), mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if req.CustomerFields != nil {
		for _, key := range domain.FieldKeyOrder {
			if v, ok := req.CustomerFields[key]; ok {
				mode := strings.ToLower(strings.TrimSpace(v))
				if mode == domain.FieldModeRequired || mode == domain.FieldModeOptional || mode == domain.FieldModeDisabled {
					cur.CustomerFields[key] = mode
				}
			}
		}
	}
	if req.EnabledNetworks != nil {
		cur.EnabledNetworks = normalizeEnabledNetworks(req.EnabledNetworks, cur.EnabledNetworks)
	}
	if req.DefaultNetwork != nil {
		cur.DefaultNetwork = strings.ToLower(strings.TrimSpace(*req.DefaultNetwork))
	}
	if req.DefaultExpiryMinutes != nil {
		cur.DefaultExpiryMinutes = *req.DefaultExpiryMinutes
	}
	if req.FulfillmentRequired != nil {
		cur.FulfillmentRequired = *req.FulfillmentRequired
	}
	if req.SuccessMessage != nil {
		cur.SuccessMessage = *req.SuccessMessage
	}
	if req.CheckoutAccent != nil {
		cur.CheckoutAccent = strings.ToLower(strings.TrimSpace(*req.CheckoutAccent))
	}
	if err := s.saveCheckoutDefaults(r.Context(), mid, cur); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	out, _ := s.loadCheckoutDefaults(r.Context(), mid)
	writeJSON(w, http.StatusOK, out)
}
