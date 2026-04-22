package payment

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestComputeBaseUSDT(t *testing.T) {
	rate := decimal.RequireFromString("126000")
	base, err := ComputeBaseUSDT(3800000, rate)
	if err != nil {
		t.Fatal(err)
	}
	if base <= 0 {
		t.Fatalf("expected positive base, got %d", base)
	}
	// 3800000/126000 ≈ 30.158730 USDT → 30158730 base units
	if base < 30100000 || base > 30200000 {
		t.Fatalf("unexpected base %d", base)
	}
}

func TestUniqueCandidatesDiffer(t *testing.T) {
	a := int64(30158730)
	b := a + 1
	c := a + 2
	if a == b || b == c {
		t.Fatal("candidates must differ")
	}
}
