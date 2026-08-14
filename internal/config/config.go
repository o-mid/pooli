package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv                      string
	APIAddr                     string
	WebOrigin                   string
	PublicBaseURL               string
	DatabaseURL                 string
	RedisURL                    string
	SessionSecret               string
	AdminEmails                 map[string]bool
	RateProvider                string
	RateFallbackProvider        string
	RatePolicy                  string
	MockUSDTTmnRate             string
	QuoteTTL                    time.Duration
	LatePaymentReconcileWindow  time.Duration
	RateStale                   time.Duration
	RateCache                   time.Duration
	RateMaxAge                  time.Duration
	RateProviderTimeout         time.Duration
	EnableChainSimulator        bool
	TronNetwork                 string
	TronGridBaseURL             string
	TronGridAPIKey              string
	TronUSDTContract            string
	BSCNetwork                  string
	BSCRPCURL                   string
	BSCChainID                  int64
	BSCUSDTContract             string
	BSCUSDTDecimals             int
	BSCConfirmations            int
	TronConfirmations           int
	ChainPollInterval           time.Duration
	TelegramBotToken            string
	TelegramEnabled             bool
	TelegramBotUsername         string
	TelegramWebhookSecret       string
	TelegramWebhookBaseURL      string
	TelegramConnectTokenTTL     time.Duration
	InstagramEnabled            bool
	InstagramAccessToken        string
	InstagramIGUserID           string
	InstagramWebhookVerifyToken string
	InstagramAppSecret          string
	InstagramGraphBase          string
	InstagramGraphVersion       string
	InstagramBindCodeTTL        time.Duration
	UploadDir                   string
	TronExplorerTxURL           string
	BSCExplorerTxURL            string
	EnableBSCWatcher            bool
	// EnableBSCCheckout controls whether buyers can select BNB Chain at checkout.
	// Keep false until WalletConnect + watcher are production-verified.
	EnableBSCCheckout bool
	// OTPSMSProvider: "mock" (default) or a future real SMS provider id.
	// Phone OTP is rejected in production while provider is mock.
	OTPSMSProvider string
	GitSHA         string
	// WorkerHeartbeatStale is the max age for chain-worker heartbeat to count as OK.
	WorkerHeartbeatStale time.Duration
	GoogleClientID       string
	GoogleClientSecret   string
	GoogleRedirectURL    string
	EmailEnabled         bool
	EmailProvider        string // resend | fake
	ResendAPIKey         string
	EmailFromName        string
	EmailFromAddress     string
	EmailReplyTo         string
	EmailTimeout         time.Duration
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
		AppEnv:                      getenv("APP_ENV", "development"),
		APIAddr:                     getenv("API_ADDR", ":8080"),
		WebOrigin:                   getenv("WEB_ORIGIN", "http://localhost:3000"),
		PublicBaseURL:               getenv("PUBLIC_BASE_URL", "http://localhost:3000"),
		DatabaseURL:                 getenv("DATABASE_URL", "postgres://pooli:pooli@localhost:5432/pooli?sslmode=disable"),
		RedisURL:                    getenv("REDIS_URL", "redis://localhost:6379/0"),
		SessionSecret:               getenv("SESSION_SECRET", "dev-session-secret-change-me-32chars"),
		AdminEmails:                 admin,
		RateProvider:                getenv("RATE_PROVIDER", "mock"),
		RateFallbackProvider:        getenv("RATE_FALLBACK_PROVIDER", "wallex"),
		RatePolicy:                  getenv("RATE_POLICY", "best_buy"),
		MockUSDTTmnRate:             getenv("MOCK_USDT_TMN_RATE", "126000"),
		QuoteTTL:                    durationSeconds("QUOTE_TTL_SECONDS", 600),
		LatePaymentReconcileWindow:  durationSeconds("LATE_PAYMENT_RECONCILE_WINDOW_SECONDS", 7200),
		RateStale:                   durationSeconds("RATE_STALE_SECONDS", 180),
		RateCache:                   durationSeconds("RATE_CACHE_SECONDS", 20),
		RateMaxAge:                  durationSeconds("RATE_MAX_AGE_SECONDS", 60),
		RateProviderTimeout:         durationSeconds("RATE_PROVIDER_TIMEOUT_SECONDS", 5),
		EnableChainSimulator:        getenv("ENABLE_CHAIN_SIMULATOR", "true") == "true",
		TronNetwork:                 tronNet,
		TronGridBaseURL:             getenv("TRONGRID_BASE_URL", "https://nile.trongrid.io"),
		TronGridAPIKey:              getenv("TRONGRID_API_KEY", ""),
		TronUSDTContract:            getenv("TRON_USDT_CONTRACT", NileUSDTTRC20),
		BSCNetwork:                  strings.ToLower(getenv("BSC_NETWORK", "mainnet")),
		BSCRPCURL:                   getenv("BSC_RPC_URL", "https://bsc-dataseed.binance.org"),
		BSCChainID:                  int64(getenvInt("BSC_CHAIN_ID", 56)),
		BSCUSDTContract:             getenv("BSC_USDT_CONTRACT", MainnetUSDTBEP20),
		BSCUSDTDecimals:             getenvInt("BSC_USDT_DECIMALS", 18),
		BSCConfirmations:            getenvInt("BSC_CONFIRMATIONS", 15),
		TronConfirmations:           getenvInt("TRON_CONFIRMATIONS", tronConfDefault),
		ChainPollInterval:           durationSeconds("CHAIN_POLL_INTERVAL_SECONDS", 8),
		TelegramBotToken:            getenv("TELEGRAM_BOT_TOKEN", ""),
		TelegramEnabled:             getenv("TELEGRAM_ENABLED", "false") == "true",
		TelegramBotUsername:         getenv("TELEGRAM_BOT_USERNAME", "PooliShopbot"),
		TelegramWebhookSecret:       getenv("TELEGRAM_WEBHOOK_SECRET", ""),
		TelegramWebhookBaseURL:      getenv("TELEGRAM_WEBHOOK_BASE_URL", ""),
		TelegramConnectTokenTTL:     durationSeconds("TELEGRAM_CONNECT_TOKEN_TTL_SECONDS", 600),
		InstagramEnabled:            getenv("INSTAGRAM_ENABLED", "false") == "true",
		InstagramAccessToken:        getenv("INSTAGRAM_ACCESS_TOKEN", ""),
		InstagramIGUserID:           getenv("INSTAGRAM_IG_USER_ID", ""),
		InstagramWebhookVerifyToken: getenv("INSTAGRAM_WEBHOOK_VERIFY_TOKEN", ""),
		InstagramAppSecret:          getenv("INSTAGRAM_APP_SECRET", ""),
		InstagramGraphBase:          getenv("INSTAGRAM_GRAPH_BASE", "https://graph.instagram.com"),
		InstagramGraphVersion:       getenv("INSTAGRAM_GRAPH_VERSION", "v21.0"),
		InstagramBindCodeTTL:        durationSeconds("INSTAGRAM_BIND_CODE_TTL_SECONDS", 600),
		UploadDir:                   getenv("UPLOAD_DIR", "uploads"),
		TronExplorerTxURL:           getenv("TRON_EXPLORER_TX_URL", tronExplorer),
		BSCExplorerTxURL:            getenv("BSC_EXPLORER_TX_URL", "https://bscscan.com/tx/%s"),
		EnableBSCWatcher:            getenv("ENABLE_BSC_WATCHER", "true") == "true",
		EnableBSCCheckout:           getenv("ENABLE_BSC_CHECKOUT", "false") == "true",
		OTPSMSProvider:              strings.ToLower(getenv("OTP_SMS_PROVIDER", "mock")),
		GitSHA:                      getenv("GIT_SHA", ""),
		WorkerHeartbeatStale:        durationSeconds("WORKER_HEARTBEAT_STALE_SECONDS", 120),
		GoogleClientID:              getenv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:          getenv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:           getenv("GOOGLE_REDIRECT_URL", ""),
		EmailEnabled:                getenv("EMAIL_ENABLED", "false") == "true",
		EmailProvider:               strings.ToLower(getenv("EMAIL_PROVIDER", "resend")),
		ResendAPIKey:                getenv("RESEND_API_KEY", ""),
		EmailFromName:               getenv("EMAIL_FROM_NAME", "Pooli"),
		EmailFromAddress:            getenv("EMAIL_FROM_ADDRESS", "notifications@notify.pooli.shop"),
		EmailReplyTo:                getenv("EMAIL_REPLY_TO", "support@pooli.shop"),
		EmailTimeout:                durationSeconds("EMAIL_TIMEOUT_SECONDS", 8),
	}
	if cfg.GoogleRedirectURL == "" && cfg.PublicBaseURL != "" {
		cfg.GoogleRedirectURL = strings.TrimRight(cfg.PublicBaseURL, "/") + "/api/v1/auth/google/callback"
	}
	return cfg
}

// ValidateEmail returns a fatal configuration error when email is enabled unsafely.
// When EMAIL_ENABLED=false, missing credentials are allowed (no crash).
func (c Config) ValidateEmail() error {
	if !c.EmailEnabled {
		return nil
	}
	provider := strings.ToLower(strings.TrimSpace(c.EmailProvider))
	switch provider {
	case "resend":
		if strings.TrimSpace(c.ResendAPIKey) == "" {
			return fmt.Errorf("RESEND_API_KEY is required when EMAIL_ENABLED=true and EMAIL_PROVIDER=resend")
		}
	case "fake":
		if c.AppEnv == "production" {
			return fmt.Errorf("EMAIL_PROVIDER=fake is forbidden in production")
		}
	default:
		return fmt.Errorf("EMAIL_PROVIDER must be resend or fake (got %q)", c.EmailProvider)
	}
	if strings.TrimSpace(c.EmailFromAddress) == "" {
		return fmt.Errorf("EMAIL_FROM_ADDRESS is required when EMAIL_ENABLED=true")
	}
	if c.AppEnv == "production" && strings.Contains(strings.ToLower(c.EmailFromAddress), "resend.dev") {
		return fmt.Errorf("EMAIL_FROM_ADDRESS must not use onboarding@resend.dev in production")
	}
	return nil
}

// InstagramReady is true when the seller DM composer can call Graph.
// Webhook GET verify still works with only INSTAGRAM_WEBHOOK_VERIFY_TOKEN.
func (c Config) InstagramReady() bool {
	return c.InstagramEnabled &&
		strings.TrimSpace(c.InstagramAccessToken) != "" &&
		strings.TrimSpace(c.InstagramIGUserID) != ""
}

// GoogleOAuthEnabled reports whether Google sign-in is configured.
func (c Config) GoogleOAuthEnabled() bool {
	return strings.TrimSpace(c.GoogleClientID) != "" &&
		strings.TrimSpace(c.GoogleClientSecret) != "" &&
		strings.TrimSpace(c.GoogleRedirectURL) != ""
}

// PhoneOTPEnabled is true only when a real SMS provider is configured.
// Mock OTP must never be the sole production phone auth path.
func (c Config) PhoneOTPEnabled() bool {
	p := strings.ToLower(strings.TrimSpace(c.OTPSMSProvider))
	if p == "" || p == "mock" || p == "none" || p == "disabled" {
		// Allow mock OTP outside production for local/CI.
		return c.AppEnv != "production"
	}
	return true
}

// CheckoutNetworks returns networks offered to buyers when creating payment options.
func (c Config) CheckoutNetworks() []string {
	nets := []string{"tron"}
	if c.EnableBSCCheckout {
		nets = append(nets, "bsc")
	}
	return nets
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
