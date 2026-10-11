package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/pooli-shop/pooli/internal/agent"
)

type ctxAgentMerchantKey struct{}

func (s *Server) requireAgentGateway(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cfgSecret := strings.TrimSpace(s.Cfg.AgentGatewaySecret)
		got := strings.TrimSpace(r.Header.Get("X-Pooli-Gateway-Secret"))
		if cfgSecret == "" || got == "" || got != cfgSecret {
			writeErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		scope := strings.TrimSpace(r.Header.Get("X-Pooli-Merchant-Id"))
		if scope == "" {
			writeErr(w, http.StatusBadRequest, "merchant scope required")
			return
		}
		ctx := context.WithValue(r.Context(), ctxAgentMerchantKey{}, scope)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func agentMerchantFrom(ctx context.Context) string {
	v, _ := ctx.Value(ctxAgentMerchantKey{}).(string)
	return v
}

func (s *Server) handleAgentOrderSnapshotByOrderID(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderId")
	if orderID == "" {
		writeErr(w, http.StatusBadRequest, "missing order id")
		return
	}
	snap, err := agent.BuildOrderSnapshotByOrderID(r.Context(), s.Pool, orderID, s.Cfg.PublicBaseURL)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) handleAgentOrderSnapshot(w http.ResponseWriter, r *http.Request) {
	merchantID := chi.URLParam(r, "merchantId")
	orderID := chi.URLParam(r, "orderId")
	if merchantID == "" || orderID == "" {
		writeErr(w, http.StatusBadRequest, "missing ids")
		return
	}
	if scope := agentMerchantFrom(r.Context()); scope != merchantID {
		writeErr(w, http.StatusForbidden, "merchant scope mismatch")
		return
	}
	snap, err := agent.BuildOrderSnapshot(r.Context(), s.Pool, merchantID, orderID, s.Cfg.PublicBaseURL)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, snap)
}
