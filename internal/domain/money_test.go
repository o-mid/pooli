package domain

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestTomanToUSDT(t *testing.T) {
	usdt, err := TomanToUSDT(3800000, decimal.RequireFromString("126000"))
	if err != nil {
		t.Fatal(err)
	}
	if usdt.LessThanOrEqual(decimal.Zero) {
		t.Fatal("expected positive")
	}
	base := USDTToBaseUnits(usdt)
	back := USDTFromBaseUnits(base)
	if !back.Equal(usdt.Round(USDTDecimals)) {
		t.Fatalf("roundtrip mismatch %s vs %s", back, usdt)
	}
}
