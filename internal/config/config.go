package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv               string
	APIAddr              string
	WebOrigin            string
	PublicBaseURL        string
	DatabaseURL          string
	RedisURL             string
	SessionSecret        string
	AdminEmails          map[string]bool
	RateProvider         string
	MockUSDTTmnRate      string
	QuoteTTL                    time.Duration
	LatePaymentReconcileWindow  time.Duration
	RateStale                   time.Duration
	EnableChainSimulator        bool
	TronNetwork          string
	TronGridBaseURL      string
	TronGridAPIKey       string
	TronUSDTContract     string
	BSCNetwork           string
	BSCRPCURL            string
	BSCChainID           int64
	BSCUSDTContract      string
	BSCUSDTDecimals      int
	BSCConfirmations     int
	TronConfirmations    int
	ChainPollInterval    time.Duration
	TelegramBotToken     string
	TelegramEnabled      bool
	UploadDir            string
	TronExplorerTxURL    string
	BSCExplorerTxURL     string
	EnableBSCWatcher     bool
	GoogleClientID       string
	GoogleClientSecret   string
	GoogleRedirectURL    string
}

// Canonical Binance-Peg USDT on BNB Smart Chain mainnet (18 decimals).
const MainnetUSDTBEP20 = "0x55d398326f99059fF775485246999027B3197955"

const (
	MainnetUSDTTRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
	NileUSDTTRC20    = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
)

func Load() Config {
	admin := map[string]bool{}
	for _, e := range strings.Split(getenv("ADMIN_EMAILS", ""), ",") {
		e = strings.TrimSpace(strings.ToLower(e))
		if e != "" {
			admin[e] = true
		}
	}
	tronNet := strings.ToLower(getenv("TRON_NETWORK", "nile"))
	tronConfDefault := 1
	tronExplorer := "https://nile.tronscan.org/#/transaction/%s"
	if tronNet == "mainnet" {
		tronConfDefault = 20
		tronExplorer = "https://tronscan.org/#/transaction/%s"
	}
	cfg := Config{
		AppEnv:               getenv("APP_ENV", "development"),
		APIAddr:              getenv("API_ADDR", ":8080"),
		WebOrigin:            getenv("WEB_ORIGIN", "http://localhost:3000"),
		PublicBaseURL:        getenv("PUBLIC_BASE_URL", "http://localhost:3000"),
		DatabaseURL:          getenv("DATABASE_URL", "postgres://pooli:pooli@localhost:5432/pooli?sslmode=disable"),
		RedisURL:             getenv("REDIS_URL", "redis://localhost:6379/0"),
		SessionSecret:        getenv("SESSION_SECRET", "dev-session-secret-change-me-32chars"),
		AdminEmails:          admin,
		RateProvider:         getenv("RATE_PROVIDER", "mock"),
		MockUSDTTmnRate:      getenv("MOCK_USDT_TMN_RATE", "126000"),
		QuoteTTL:                   durationSeconds("QUOTE_TTL_SECONDS", 600),
		LatePaymentReconcileWindow: durationSeconds("LATE_PAYMENT_RECONCILE_WINDOW_SECONDS", 7200),
		RateStale:                  durationSeconds("RATE_STALE_SECONDS", 180),
		EnableChainSimulator:       getenv("ENABLE_CHAIN_SIMULATOR", "true") == "true",
		TronNetwork:          tronNet,
		TronGridBaseURL:      getenv("TRONGRID_BASE_URL", "https://nile.trongrid.io"),
		TronGridAPIKey:       getenv("TRONGRID_API_KEY", ""),
		TronUSDTContract:     getenv("TRON_USDT_CONTRACT", NileUSDTTRC20),
		BSCNetwork:           strings.ToLower(getenv("BSC_NETWORK", "mainnet")),
		BSCRPCURL:            getenv("BSC_RPC_URL", "https://bsc-dataseed.binance.org"),
		BSCChainID:           int64(getenvInt("BSC_CHAIN_ID", 56)),
		BSCUSDTContract:      getenv("BSC_USDT_CONTRACT", MainnetUSDTBEP20),
		BSCUSDTDecimals:      getenvInt("BSC_USDT_DECIMALS", 18),
		BSCConfirmations:     getenvInt("BSC_CONFIRMATIONS", 15),
		TronConfirmations:    getenvInt("TRON_CONFIRMATIONS", tronConfDefault),
		ChainPollInterval:    durationSeconds("CHAIN_POLL_INTERVAL_SECONDS", 8),
		TelegramBotToken:     getenv("TELEGRAM_BOT_TOKEN", ""),
		TelegramEnabled:      getenv("TELEGRAM_ENABLED", "false") == "true",
		UploadDir:            getenv("UPLOAD_DIR", "uploads"),
		TronExplorerTxURL:    getenv("TRON_EXPLORER_TX_URL", tronExplorer),
		BSCExplorerTxURL:     getenv("BSC_EXPLORER_TX_URL", "https://bscscan.com/tx/%s"),
		EnableBSCWatcher:     getenv("ENABLE_BSC_WATCHER", "true") == "true",
		GoogleClientID:       getenv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:   getenv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:    getenv("GOOGLE_REDIRECT_URL", ""),
	}
	if cfg.GoogleRedirectURL == "" && cfg.PublicBaseURL != "" {
		cfg.GoogleRedirectURL = strings.TrimRight(cfg.PublicBaseURL, "/") + "/api/v1/auth/google/callback"
	}
	return cfg
}

// GoogleOAuthEnabled reports whether Google sign-in is configured.
func (c Config) GoogleOAuthEnabled() bool {
	return strings.TrimSpace(c.GoogleClientID) != "" &&
		strings.TrimSpace(c.GoogleClientSecret) != "" &&
		strings.TrimSpace(c.GoogleRedirectURL) != ""
}

// ValidateBSCPilot returns a fatal configuration error for unsafe BSC mainnet settings.
func (c Config) ValidateBSCPilot() error {
	if !c.EnableBSCWatcher {
		return nil
	}
	if c.BSCNetwork != "mainnet" {
		return nil
	}
	if strings.TrimSpace(c.BSCRPCURL) == "" {
		return fmt.Errorf("BSC_RPC_URL is required when ENABLE_BSC_WATCHER=true")
	}
	if !strings.EqualFold(c.BSCUSDTContract, MainnetUSDTBEP20) {
		return fmt.Errorf("BSC_USDT_CONTRACT must be canonical Binance-Peg USDT %s", MainnetUSDTBEP20)
	}
	if c.BSCUSDTDecimals != 18 {
		return fmt.Errorf("BSC_USDT_DECIMALS must be 18 for Binance-Peg USDT (got %d)", c.BSCUSDTDecimals)
	}
	if c.BSCChainID != 56 {
		return fmt.Errorf("BSC_CHAIN_ID must be 56 for BNB Smart Chain mainnet (got %d)", c.BSCChainID)
	}
	if c.BSCConfirmations < 12 {
		return fmt.Errorf("BSC_CONFIRMATIONS=%d is below the pilot minimum of 12", c.BSCConfirmations)
	}
	if c.EnableChainSimulator {
		return fmt.Errorf("ENABLE_CHAIN_SIMULATOR must be false when running the BSC mainnet watcher")
	}
	return nil
}

// ValidateTronPilot returns a fatal configuration error for unsafe mainnet settings.
func (c Config) ValidateTronPilot() error {
	if c.TronNetwork != "mainnet" {
		return nil
	}
	if strings.TrimSpace(c.TronGridAPIKey) == "" {
		return fmt.Errorf("TRONGRID_API_KEY is required for TRON mainnet")
	}
	if c.TronUSDTContract == NileUSDTTRC20 {
		return fmt.Errorf("TRON_USDT_CONTRACT looks like Nile test USDT; set mainnet %s", MainnetUSDTTRC20)
	}
	if c.TronUSDTContract != MainnetUSDTTRC20 {
		return fmt.Errorf("TRON_USDT_CONTRACT must be official mainnet USDT %s", MainnetUSDTTRC20)
	}
	if !strings.Contains(c.TronGridBaseURL, "api.trongrid.io") && !strings.Contains(c.TronGridBaseURL, "trongrid.io") {
		return fmt.Errorf("TRONGRID_BASE_URL unexpected for mainnet: %s", c.TronGridBaseURL)
	}
	if c.EnableChainSimulator {
		return fmt.Errorf("ENABLE_CHAIN_SIMULATOR must be false on mainnet pilot")
	}
	return nil
}

func (c Config) ExplorerTxURL(network, txHash string) string {
	switch network {
	case "tron":
		return fmt.Sprintf(c.TronExplorerTxURL, txHash)
	case "bsc":
		return fmt.Sprintf(c.BSCExplorerTxURL, txHash)
	default:
		return ""
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getenvInt(k string, def int) int {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func durationSeconds(k string, def int) time.Duration {
	return time.Duration(getenvInt(k, def)) * time.Second
}
