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
