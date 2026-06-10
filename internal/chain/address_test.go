package chain

import (
	"testing"

	"github.com/pooli-shop/pooli/internal/domain"
)

func TestTronAddressValidation(t *testing.T) {
	a := NewTronAdapter("https://example", "", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", 1)
	if err := a.ValidateAddress("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "0xabc", "Tshort", "XXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"} {
		if err := a.ValidateAddress(bad); err == nil {
			t.Fatalf("expected invalid for %q", bad)
		}
	}
}

func TestEVMAddressValidation(t *testing.T) {
	n := &NoopAdapter{Name: domain.NetworkBSC}
	if err := n.ValidateAddress("0x55d398326f99059ff775485246999027b3197955"); err != nil {
		t.Fatal(err)
	}
	if err := n.ValidateAddress("0x123"); err == nil {
		t.Fatal("expected invalid short address")
	}
	if err := n.ValidateAddress("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"); err == nil {
		t.Fatal("expected invalid tron address on evm adapter")
	}
}
