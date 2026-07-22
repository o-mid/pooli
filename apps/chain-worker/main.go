package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/pooli-shop/pooli/internal/chain"
	"github.com/pooli-shop/pooli/internal/config"
	"github.com/pooli-shop/pooli/internal/db"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/notify"
	"github.com/pooli-shop/pooli/internal/payment"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	if err := cfg.ValidateTronPilot(); err != nil {
		log.Fatal(err)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	tg := &notify.Telegram{Pool: pool, Token: cfg.TelegramBotToken, Enabled: cfg.TelegramEnabled}
	matcher := &payment.Matcher{
		Pool:              pool,
		BSCConfirmations:  cfg.BSCConfirmations,
		TronConfirmations: cfg.TronConfirmations,
		OnTransition: func(merchantID, intentID, eventType string, payload map[string]any) {
			log.Printf("transition %s intent=%s", eventType, intentID)
			if eventType != "payment.paid" {
				return
			}
			var toman, usdt int64
			var orderRef string
			network, _ := payload["network"].(string)
			txHash, _ := payload["tx_hash"].(string)
			_ = pool.QueryRow(context.Background(), `
				SELECT o.fiat_amount_toman, COALESCE(NULLIF(o.merchant_reference,''), o.slug),
				       COALESCE((SELECT pay_usdt_amount_base_units FROM payment_options WHERE payment_intent_id=$1::uuid AND status='SETTLED' LIMIT 1),0)
				FROM payment_intents pi JOIN orders o ON o.id=pi.order_id WHERE pi.id=$1::uuid`, intentID).
				Scan(&toman, &orderRef, &usdt)
			_ = tg.NotifyPaid(context.Background(), merchantID, orderRef, toman, usdt, network, txHash)
		},
	}

	var adapters []chain.Adapter
	if cfg.EnableBSCWatcher {
		if evm, err := chain.NewEVMAdapter(cfg.BSCRPCURL, domain.NetworkBSC, cfg.BSCChainID, cfg.BSCUSDTContract, cfg.BSCConfirmations); err == nil {
			adapters = append(adapters, evm)
		} else {
			log.Printf("evm adapter disabled: %v", err)
		}
	} else {
		log.Printf("BSC watcher disabled (ENABLE_BSC_WATCHER=false)")
	}
	adapters = append(adapters, chain.NewTronAdapterWithNetwork(
		cfg.TronGridBaseURL, cfg.TronGridAPIKey, cfg.TronUSDTContract, cfg.TronConfirmations, cfg.TronNetwork,
	))

	log.Printf("chain-worker started; tron=%s conf=%d poll=%s", cfg.TronNetwork, cfg.TronConfirmations, cfg.ChainPollInterval)
	ticker := time.NewTicker(cfg.ChainPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, ad := range adapters {
				if err := pollNetwork(ctx, pool, matcher, ad); err != nil {
					log.Printf("poll %s: %v", ad.Network(), err)
				}
				if err := advanceConfirmations(ctx, pool, matcher, ad); err != nil {
					log.Printf("confirm %s: %v", ad.Network(), err)
				}
			}
			expireIntents(ctx, pool)
		}
	}
}

func pollNetwork(ctx context.Context, pool *pgxpool.Pool, matcher *payment.Matcher, ad chain.Adapter) error {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT address_normalized, contract_address
		FROM merchant_wallet_addresses
		WHERE network=$1 AND is_active=true`, ad.Network())
	if err != nil {
		return err
	}
	defer rows.Close()

	var addrs []string
	var token string
	for rows.Next() {
		var a, c string
		if err := rows.Scan(&a, &c); err != nil {
			return err
		}
		addrs = append(addrs, a)
		token = c
	}
	if len(addrs) == 0 {
		return nil
	}

	var cursor string
	_ = pool.QueryRow(ctx, `SELECT cursor_value FROM watcher_cursors WHERE network=$1`, ad.Network()).Scan(&cursor)
	events, next, err := ad.ObserveTransfers(ctx, addrs, token, cursor)
	if err != nil {
		return err
	}
	for _, ev := range events {
		verified, err := ad.VerifyTransfer(ctx, ev)
		if err != nil {
			log.Printf("verify skip %s: %v", ev.EventID, err)
			continue
		}
		if _, err := matcher.Ingest(ctx, verified); err != nil {
			log.Printf("ingest %s: %v", ev.EventID, err)
		}
	}
	if next != "" {
		_, _ = pool.Exec(ctx, `
			INSERT INTO watcher_cursors (network, cursor_value, updated_at)
			VALUES ($1,$2,now())
			ON CONFLICT (network) DO UPDATE SET cursor_value=EXCLUDED.cursor_value, updated_at=now()`,
			ad.Network(), next)
	}
	return nil
}

func advanceConfirmations(ctx context.Context, pool *pgxpool.Pool, matcher *payment.Matcher, ad chain.Adapter) error {
	rows, err := pool.Query(ctx, `
		SELECT ce.event_id, ce.tx_hash, ce.network, COALESCE(ce.chain_id, 0), ce.confirmations, ce.block_number
		FROM chain_events ce
		JOIN matched_transactions mt ON mt.chain_event_id = ce.id
		JOIN payment_intents pi ON pi.id = mt.payment_intent_id
		WHERE ce.network=$1
		  AND mt.match_type='EXACT'
		  AND pi.status IN ('SEEN','CONFIRMING')
		ORDER BY ce.observed_at ASC
		LIMIT 50`, ad.Network())
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var eventID, txHash, network string
		var chainID int64
		var confs int
		var blockNumber int64
		if err := rows.Scan(&eventID, &txHash, &network, &chainID, &confs, &blockNumber); err != nil {
			return err
		}
		var chainIDPtr *int64
		if chainID != 0 {
			chainIDPtr = &chainID
		}
		ev := domain.ChainEvent{
			EventID: eventID, TxHash: txHash, Network: network, ChainID: chainIDPtr,
			Confirmations: confs, BlockNumber: blockNumber,
		}
		conf, err := ad.ConfirmationStatus(ctx, ev)
		if err != nil {
			log.Printf("confirmation status %s: %v", txHash, err)
			continue
		}
		if err := matcher.ApplyConfirmations(ctx, eventID, conf); err != nil {
			log.Printf("apply confirmations %s: %v", eventID, err)
		}
	}
	return rows.Err()
}

func expireIntents(ctx context.Context, pool *pgxpool.Pool) {
	_, _ = pool.Exec(ctx, `
		UPDATE payment_intents SET status='EXPIRED', updated_at=now()
		WHERE status IN ('CREATED','AWAITING_PAYMENT') AND expires_at < now()`)
	_, _ = pool.Exec(ctx, `
		UPDATE amount_reservations SET status='released'
		WHERE status='active' AND expires_at < now()`)
	_, _ = pool.Exec(ctx, `
		UPDATE orders SET status='EXPIRED', updated_at=now()
		WHERE status='AWAITING_PAYMENT' AND expires_at IS NOT NULL AND expires_at < now()`)
}
