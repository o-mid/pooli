package config

import "testing"

func TestValidateBSCPilot(t *testing.T) {
	ok := Config{
		EnableBSCWatcher:     true,
		BSCNetwork:           "mainnet",
		BSCRPCURL:            "https://example.invalid/bsc",
		BSCUSDTContract:      MainnetUSDTBEP20,
		BSCUSDTDecimals:      18,
		BSCChainID:           56,
		BSCConfirmations:     15,
		EnableChainSimulator: false,
	}
	if err := ok.ValidateBSCPilot(); err != nil {
		t.Fatal(err)
	}
	bad := ok
	bad.BSCUSDTDecimals = 6
	if err := bad.ValidateBSCPilot(); err == nil {
		t.Fatal("expected decimals error")
	}
	disabled := ok
	disabled.EnableBSCWatcher = false
	disabled.BSCUSDTDecimals = 6
	if err := disabled.ValidateBSCPilot(); err != nil {
		t.Fatal(err)
	}
}

func TestGoogleRedirectDefault(t *testing.T) {
	t.Setenv("PUBLIC_BASE_URL", "https://pooli.shop")
	t.Setenv("GOOGLE_CLIENT_ID", "cid")
	t.Setenv("GOOGLE_CLIENT_SECRET", "sec")
	t.Setenv("GOOGLE_REDIRECT_URL", "")
	cfg := Load()
	if cfg.GoogleRedirectURL != "https://pooli.shop/api/v1/auth/google/callback" {
		t.Fatalf("redirect=%q", cfg.GoogleRedirectURL)
	}
	if !cfg.GoogleOAuthEnabled() {
		t.Fatal("expected google oauth enabled")
	}
}

func TestValidateBSCPilotRejectsSimulator(t *testing.T) {
	cfg := Config{
		EnableBSCWatcher: true, BSCNetwork: "mainnet", BSCRPCURL: "https://x",
		BSCUSDTContract: MainnetUSDTBEP20, BSCUSDTDecimals: 18, BSCChainID: 56,
		BSCConfirmations: 15, EnableChainSimulator: true,
	}
	if err := cfg.ValidateBSCPilot(); err == nil {
		t.Fatal("expected simulator conflict")
	}
}

func TestPhoneOTPDisabledInProductionWithMock(t *testing.T) {
	cfg := Config{AppEnv: "production", OTPSMSProvider: "mock"}
	if cfg.PhoneOTPEnabled() {
		t.Fatal("mock OTP must be disabled in production")
	}
	dev := Config{AppEnv: "development", OTPSMSProvider: "mock"}
	if !dev.PhoneOTPEnabled() {
		t.Fatal("mock OTP allowed in development")
	}
}

func TestCheckoutNetworksBSCGated(t *testing.T) {
	off := Config{EnableBSCCheckout: false}
	if got := off.CheckoutNetworks(); len(got) != 1 || got[0] != "tron" {
		t.Fatalf("got %#v", got)
	}
	on := Config{EnableBSCCheckout: true}
	if got := on.CheckoutNetworks(); len(got) != 2 {
		t.Fatalf("got %#v", got)
	}
}
