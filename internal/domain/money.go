package domain

import (
	"fmt"

	"github.com/shopspring/decimal"
)

// IRRPerToman is the fixed Iranian Rial → Toman scale (10 IRR = 1 Toman).
const IRRPerToman int64 = 10

// IRRToToman converts an IRR (Rial) amount to Toman. Single normalization entrypoint.
func IRRToToman(irr decimal.Decimal) decimal.Decimal {
	return irr.Div(decimal.NewFromInt(IRRPerToman))
}

// TomanToUSDT converts integer toman to USDT using usdtTmnRate (toman per 1 USDT).
func TomanToUSDT(toman int64, usdtTmnRate decimal.Decimal) (decimal.Decimal, error) {
	if toman <= 0 {
		return decimal.Zero, fmt.Errorf("toman must be positive")
	}
	if usdtTmnRate.LessThanOrEqual(decimal.Zero) {
		return decimal.Zero, fmt.Errorf("rate must be positive")
	}
	return decimal.NewFromInt(toman).Div(usdtTmnRate).Round(USDTDecimals), nil
}

// FormatUSDTBaseUnits returns a fixed-scale USDT string for display/copy.
func FormatUSDTBaseUnits(base int64) string {
	return USDTFromBaseUnits(base).StringFixed(USDTDecimals)
}

// FormatToman formats integer toman with thousands separators omitted for API simplicity.
func FormatToman(toman int64) string {
	return fmt.Sprintf("%d", toman)
}
