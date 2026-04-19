package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/pooli-shop/pooli/internal/domain"
)

func (s *Server) handleListWallets(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rows, err := s.Pool.Query(r.Context(), `
		SELECT id::text, network, chain_id, address, asset, contract_address, label, is_default, is_active, verified_at, created_at
		FROM merchant_wallet_addresses WHERE merchant_id=$1::uuid ORDER BY created_at DESC`, mid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, network, address, asset, contract, label string
		var chainID *int64
		var isDefault, isActive bool
		var verifiedAt, createdAt interface{}
		if err := rows.Scan(&id, &network, &chainID, &address, &asset, &contract, &label, &isDefault, &isActive, &verifiedAt, &createdAt); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, map[string]any{
			"id": id, "network": network, "chain_id": chainID, "address": address,
			"asset": asset, "contract_address": contract, "label": label,
			"is_default": isDefault, "is_active": isActive, "verified_at": verifiedAt, "created_at": createdAt,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"wallets": out})
}

func (s *Server) handleCreateWallet(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		Network string `json:"network"`
		Address string `json:"address"`
		Label   string `json:"label"`
		Default bool   `json:"is_default"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	adapter := s.adapterFor(req.Network)
	if adapter == nil {
		writeErr(w, http.StatusBadRequest, "unsupported network")
		return
	}
	norm, err := normalizeNetworkAddress(req.Network, req.Address, adapter)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var chainID *int64
	contract := s.Cfg.TronUSDTContract
	if req.Network == domain.NetworkBSC {
		c := s.Cfg.BSCChainID
		chainID = &c
		contract = s.Cfg.BSCUSDTContract
		contract = adapter.NormalizeAddress(contract)
	}
	if req.Default {
		_, _ = s.Pool.Exec(r.Context(), `
			UPDATE merchant_wallet_addresses SET is_default=false WHERE merchant_id=$1::uuid AND network=$2`, mid, req.Network)
	}
	var id string
	err = s.Pool.QueryRow(r.Context(), `
		INSERT INTO merchant_wallet_addresses (
			merchant_id, network, chain_id, address, address_normalized, asset, contract_address, label, is_default
		) VALUES ($1::uuid,$2,$3,$4,$5,'USDT',$6,$7,$8) RETURNING id::text`,
		mid, req.Network, chainID, req.Address, norm, contract, req.Label, req.Default).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) handlePatchWallet(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id := chi.URLParam(r, "id")
	var req struct {
		Label    *string `json:"label"`
		IsDefault *bool  `json:"is_default"`
		IsActive *bool   `json:"is_active"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.IsDefault != nil && *req.IsDefault {
		var network string
		_ = s.Pool.QueryRow(r.Context(), `SELECT network FROM merchant_wallet_addresses WHERE id=$1::uuid AND merchant_id=$2::uuid`, id, mid).Scan(&network)
		_, _ = s.Pool.Exec(r.Context(), `UPDATE merchant_wallet_addresses SET is_default=false WHERE merchant_id=$1::uuid AND network=$2`, mid, network)
	}
	_, err = s.Pool.Exec(r.Context(), `
		UPDATE merchant_wallet_addresses SET
			label = COALESCE($3, label),
			is_default = COALESCE($4, is_default),
			is_active = COALESCE($5, is_active)
		WHERE id=$1::uuid AND merchant_id=$2::uuid`, id, mid, req.Label, req.IsDefault, req.IsActive)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleDeleteWallet(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id := chi.URLParam(r, "id")
	_, err = s.Pool.Exec(r.Context(), `
		UPDATE merchant_wallet_addresses SET is_active=false WHERE id=$1::uuid AND merchant_id=$2::uuid`, id, mid)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
