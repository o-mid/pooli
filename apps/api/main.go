package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/pooli-shop/pooli/internal/chain"
	"github.com/pooli-shop/pooli/internal/config"
	"github.com/pooli-shop/pooli/internal/db"
	"github.com/pooli-shop/pooli/internal/httpapi"
	"github.com/pooli-shop/pooli/internal/notify"
	"github.com/pooli-shop/pooli/internal/payment"
	"github.com/pooli-shop/pooli/internal/rate"
	"github.com/pooli-shop/pooli/internal/sse"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	rates, err := rate.BuildProviderOpts(rate.Options{
		Name:         cfg.RateProvider,
		FallbackName: cfg.RateFallbackProvider,
		MockRate:     cfg.MockUSDTTmnRate,
		AppEnv:       cfg.AppEnv,
		Policy:       cfg.RatePolicy,
		CacheTTL:     cfg.RateCache,
		MaxAge:       cfg.RateMaxAge,
		StaleAfter:   cfg.RateStale,
		Timeout:      cfg.RateProviderTimeout,
	})
	if err != nil {
		log.Fatal(err)
	}
	hub := sse.NewHub()
	tg := &notify.Telegram{
		Pool: pool, Token: cfg.TelegramBotToken, Enabled: cfg.TelegramEnabled,
		BotUsername: cfg.TelegramBotUsername, PublicBase: cfg.PublicBaseURL,
	}
	matcher := &payment.Matcher{
		Pool: pool, BSCConfirmations: cfg.BSCConfirmations, TronConfirmations: cfg.TronConfirmations,
		LateReconcileWindow: cfg.LatePaymentReconcileWindow,
		OnTransition: func(merchantID, intentID, eventType string, payload map[string]any) {
			hub.PublishIntent(intentID, sse.Event{Type: eventType, Payload: payload})
			hub.PublishMerchant(merchantID, sse.Event{Type: eventType, Payload: payload})
			payment.RecordPaymentTimeline(context.Background(), pool, merchantID, intentID, eventType, payload)
			// Async after matcher commit — never hold matching on Telegram HTTP.
			go notify.DispatchTransition(context.Background(), pool, tg, merchantID, intentID, eventType, payload)
		},
	}

	var evmAdapter chain.Adapter
	evm, err := chain.NewEVMAdapter(cfg.BSCRPCURL, "bsc", cfg.BSCChainID, cfg.BSCUSDTContract, cfg.BSCUSDTDecimals, cfg.BSCConfirmations)
	if err != nil {
		log.Printf("warn: evm adapter unavailable: %v", err)
		evmAdapter = &chain.NoopAdapter{Name: "bsc"}
	} else {
		evmAdapter = evm
	}
	tronAdapter := chain.NewTronAdapter(cfg.TronGridBaseURL, cfg.TronGridAPIKey, cfg.TronUSDTContract, cfg.TronConfirmations)

	srv := httpapi.NewServer(cfg, pool, rates, hub, matcher, tg, evmAdapter, tronAdapter)
	httpServer := &http.Server{Addr: cfg.APIAddr, Handler: srv.Router()}

	go func() {
		log.Printf("pooli api listening on %s", cfg.APIAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}
