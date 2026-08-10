package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/auth"
	"github.com/pooli-shop/pooli/internal/chain"
	"github.com/pooli-shop/pooli/internal/config"
	"github.com/pooli-shop/pooli/internal/notify"
	"github.com/pooli-shop/pooli/internal/otp"
	"github.com/pooli-shop/pooli/internal/payment"
	"github.com/pooli-shop/pooli/internal/rate"
	"github.com/pooli-shop/pooli/internal/sse"
)

type Server struct {
	Cfg      config.Config
	Pool     *pgxpool.Pool
	Auth     *auth.Service
	OTP      *otp.Service
	Rates    rate.Provider
	Hub      *sse.Hub
	Matcher  *payment.Matcher
	Telegram *notify.Telegram
	EVM      chain.Adapter
	Tron     chain.Adapter
}

func NewServer(cfg config.Config, pool *pgxpool.Pool, rates rate.Provider, hub *sse.Hub, matcher *payment.Matcher, tg *notify.Telegram, evm, tron chain.Adapter) *Server {
	return &Server{
		Cfg: cfg, Pool: pool,
		Auth: &auth.Service{Pool: pool, AdminEmails: cfg.AdminEmails},
		OTP:  otp.NewService(pool, otp.MockProvider{}, cfg.AppEnv),
		Rates: rates, Hub: hub, Matcher: matcher, Telegram: tg, EVM: evm, Tron: tron,
	}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	// redactGoogleCallbackURI must sit inside Logger so access logs never print OAuth code/state.
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, redactGoogleCallbackURI, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{s.Cfg.WebOrigin, "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "pooli-api"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/register", s.handleRegister)
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/logout", s.handleLogout)
		r.Get("/auth/providers", s.handleGoogleAuthProviders)
		r.Get("/auth/google/start", s.handleGoogleAuthStart)
		r.Get("/auth/google/callback", s.handleGoogleAuthCallback)
		r.Post("/auth/otp/send", s.handleOTPSend)
		r.Post("/auth/otp/verify", s.handleOTPVerify)
		r.Post("/auth/otp/register", s.handleOTPRegister)
		r.Get("/public/uploads/*", s.handlePublicUpload)

		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Get("/me", s.handleMe)
			r.Get("/home", s.handleHome)
			r.Patch("/merchant", s.handlePatchMerchant)
			r.Post("/merchant/logo", s.handleMerchantLogo)
			r.Get("/merchant/checkout-defaults", s.handleGetCheckoutDefaults)
			r.Patch("/merchant/checkout-defaults", s.handlePatchCheckoutDefaults)

			r.Get("/wallets", s.handleListWallets)
			r.Post("/wallets", s.handleCreateWallet)
			r.Patch("/wallets/{id}", s.handlePatchWallet)
			r.Delete("/wallets/{id}", s.handleDeleteWallet)

			r.Get("/customers", s.handleListCustomers)
			r.Get("/customers/{id}", s.handleGetCustomer)

			r.Post("/orders", s.handleCreateOrder)
			r.Get("/orders", s.handleListOrders)
			r.Get("/orders/{id}", s.handleGetOrder)
			r.Get("/orders/{id}/timeline", s.handleGetOrderTimeline)
			r.Patch("/orders/{id}/fulfillment", s.handlePatchFulfillment)
			r.Post("/orders/{id}/payment-intent", s.handleCreatePaymentIntent)

			r.Get("/payment-intents/{id}", s.handleGetPaymentIntent)
			r.Get("/merchant/events", s.handleMerchantSSE)

			r.Post("/telegram/connect", s.handleTelegramConnect)
			r.Post("/telegram/connect-link", s.handleTelegramConnectLink)
			r.Post("/telegram/disconnect", s.handleTelegramDisconnect)
			r.Post("/telegram/test", s.handleTelegramTest)

			r.Group(func(r chi.Router) {
				r.Use(s.requireAdmin)
				r.Get("/admin/payment-intents", s.handleAdminListIntents)
				r.Get("/admin/chain-events", s.handleAdminChainEvents)
				r.Get("/admin/unmatched", s.handleAdminUnmatched)
				r.Post("/admin/resolve", s.handleAdminResolve)
			})
		})

		r.Route("/public/pay/{slug}", func(r chi.Router) {
			r.Get("/", s.handlePublicPay)
			r.Get("/preview", s.handlePublicPayPreview)
			r.Post("/customer-details", s.handlePublicCustomerDetails)
			r.Post("/select-network", s.handlePublicSelectNetwork)
			r.Post("/refresh-quote", s.handlePublicRefreshQuote)
			r.Get("/events", s.handlePublicSSE)
		})

		r.Post("/integrations/telegram/webhook", s.handleTelegramWebhook)

		if s.Cfg.EnableChainSimulator {
			r.Post("/internal/simulate/chain-event", s.handleSimulateChainEvent)
			r.Post("/internal/simulate/confirmations", s.handleSimulateConfirmations)
		}
	})

	return r
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, err := s.Auth.UserFromRequest(r.Context(), r)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserKey{}, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFrom(r.Context())
		if u == nil || !u.IsAdmin {
			writeErr(w, http.StatusForbidden, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type ctxUserKey struct{}

func userFrom(ctx context.Context) *auth.User {
	u, _ := ctx.Value(ctxUserKey{}).(auth.User)
	if u.ID == "" {
		return nil
	}
	return &u
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func (s *Server) merchantID(ctx context.Context) (string, error) {
	u := userFrom(ctx)
	return s.Auth.MerchantIDForUser(ctx, u.ID)
}

func normalizeNetworkAddress(network, addr string, adapter chain.Adapter) (string, error) {
	addr = strings.TrimSpace(addr)
	if err := adapter.ValidateAddress(addr); err != nil {
		return "", err
	}
	return adapter.NormalizeAddress(addr), nil
}

func (s *Server) adapterFor(network string) chain.Adapter {
	if network == "bsc" {
		return s.EVM
	}
	return s.Tron
}

func secureCookie(cfg config.Config) bool {
	return cfg.AppEnv == "production"
}

func nowUTC() time.Time { return time.Now().UTC() }
