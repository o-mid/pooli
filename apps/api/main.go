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

	rates, err := rate.BuildProvider(cfg.RateProvider, cfg.MockUSDTTmnRate, cfg.RateStale)
	if err != nil {
		log.Fatal(err)
	}
	hub := sse.NewHub()
	tg := &notify.Telegram{Pool: pool, Token: cfg.TelegramBotToken, Enabled: cfg.TelegramEnabled}
	matcher := &payment.Matcher{
		Pool: pool, BSCConfirmations: cfg.BSCConfirmations, TronConfirmations: cfg.TronConfirmations,
		LateReconcileWindow: cfg.LatePaymentReconcileWindow,
		OnTransition: func(merchantID, intentID, eventType string, payload map[string]any) {
			hub.PublishIntent(intentID, sse.Event{Type: eventType, Payload: payload})
			hub.PublishMerchant(merchantID, sse.Event{Type: eventType, Payload: payload})
			if eventType == "payment.paid" {
				var toman int64
				var orderRef string
				var usdt int64
				var network, txHash string
				_ = pool.QueryRow(context.Background(), `
					SELECT o.fiat_amount_toman, COALESCE(NULLIF(o.merchant_reference,''), o.slug),
					       COALESCE((SELECT pay_usdt_amount_base_units FROM payment_options WHERE payment_intent_id=$1::uuid AND status='SETTLED' LIMIT 1),0)
					FROM payment_intents pi JOIN orders o ON o.id=pi.order_id WHERE pi.id=$1::uuid`, intentID).
					Scan(&toman, &orderRef, &usdt)
				if payload != nil {
					if v, ok := payload["network"].(string); ok {
						network = v
					}
					if v, ok := payload["tx_hash"].(string); ok {
						txHash = v
					}
					if v, ok := payload["amount_base_units"].(int64); ok && v > 0 {
						usdt = v
					}
				}
				_ = tg.NotifyPaid(context.Background(), merchantID, orderRef, toman, usdt, network, txHash)
			}
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
