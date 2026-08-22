package httpapi

import (
	"context"
	"time"

	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/payment"
	"github.com/shopspring/decimal"
)

type orderMoney struct {
	UsdtBase int64
	Toman    int64
	Currency string
}

func (m orderMoney) usesUsdtNative() bool {
	return m.UsdtBase > 0
}

func (s *Server) loadOrderMoney(ctx context.Context, merchantID, orderID string) (orderMoney, error) {
	var m orderMoney
	var toman *int64
	err := s.Pool.QueryRow(ctx, `
		SELECT COALESCE(amount_usdt_base_units, 0), fiat_amount_toman, COALESCE(NULLIF(fiat_currency,''), 'TMN')
		FROM orders WHERE id=$1::uuid AND merchant_id=$2::uuid`,
		orderID, merchantID).Scan(&m.UsdtBase, &toman, &m.Currency)
	if toman != nil {
		m.Toman = *toman
	}
	return m, err
}

func (s *Server) loadOrderMoneyBySlug(ctx context.Context, slug string) (orderID, merchantID string, money orderMoney, err error) {
	var toman *int64
	err = s.Pool.QueryRow(ctx, `
		SELECT o.id::text, o.merchant_id::text,
		       COALESCE(o.amount_usdt_base_units, 0), o.fiat_amount_toman, COALESCE(NULLIF(o.fiat_currency,''), 'TMN')
		FROM orders o WHERE o.slug=$1`, slug).
		Scan(&orderID, &merchantID, &money.UsdtBase, &toman, &money.Currency)
	if toman != nil {
		money.Toman = *toman
	}
	return orderID, merchantID, money, err
}

func (s *Server) resolveIntentQuote(ctx context.Context, money orderMoney) (baseUSDT int64, quote domain.RateQuote, err error) {
	if money.usesUsdtNative() {
		return money.UsdtBase, domain.RateQuote{
			Rate:      decimal.NewFromInt(1),
			Source:    "usdt_native",
			FetchedAt: time.Now().UTC(),
		}, nil
	}
	if money.Toman <= 0 {
		return 0, domain.RateQuote{}, errAmountRequired
	}
	quote, err = s.Rates.FetchUSDTTmn(ctx)
	if err != nil {
		return 0, domain.RateQuote{}, err
	}
	if time.Since(quote.FetchedAt) > s.Cfg.RateStale {
		return 0, domain.RateQuote{}, errStaleRate
	}
	baseUSDT, err = payment.ComputeBaseUSDT(money.Toman, quote.Rate)
	if err != nil {
		return 0, domain.RateQuote{}, err
	}
	return baseUSDT, quote, nil
}

func intentFiatFromOrder(m orderMoney) (amount int64, currency string) {
	if m.usesUsdtNative() {
		return m.UsdtBase, "USDT"
	}
	return m.Toman, "TMN"
}
