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
	QuoteTTL             time.Duration
	RateStale            time.Duration
	EnableChainSimulator bool
	TronNetwork          string
	TronGridBaseURL      string
	TronGridAPIKey       string
	TronUSDTContract     string
	BSCRPCURL            string
	BSCChainID           int64
	BSCUSDTContract      string
	BSCConfirmations     int
	TronConfirmations    int
	ChainPollInterval    time.Duration
	TelegramBotToken     string
	TelegramEnabled      bool
	UploadDir            string
	TronExplorerTxURL    string
	BSCExplorerTxURL     string
}

func Load() Config {
	admin := map[string]bool{}
	for _, e := range strings.Split(getenv("ADMIN_EMAILS", ""), ",") {
		e = strings.TrimSpace(strings.ToLower(e))
		if e != "" {
			admin[e] = true
		}
	}
	return Config{
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
		QuoteTTL:             durationSeconds("QUOTE_TTL_SECONDS", 600),
		RateStale:            durationSeconds("RATE_STALE_SECONDS", 180),
		EnableChainSimulator: getenv("ENABLE_CHAIN_SIMULATOR", "true") == "true",
		TronNetwork:          getenv("TRON_NETWORK", "nile"),
		TronGridBaseURL:      getenv("TRONGRID_BASE_URL", "https://nile.trongrid.io"),
		TronGridAPIKey:       getenv("TRONGRID_API_KEY", ""),
		TronUSDTContract:     getenv("TRON_USDT_CONTRACT", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"),
		BSCRPCURL:            getenv("BSC_RPC_URL", "https://bsc-dataseed.binance.org"),
		BSCChainID:           int64(getenvInt("BSC_CHAIN_ID", 56)),
		BSCUSDTContract:      getenv("BSC_USDT_CONTRACT", "0x55d398326f99059fF775485246999027B3197955"),
		BSCConfirmations:     getenvInt("BSC_CONFIRMATIONS", 12),
		TronConfirmations:    getenvInt("TRON_CONFIRMATIONS", 1),
		ChainPollInterval:    durationSeconds("CHAIN_POLL_INTERVAL_SECONDS", 8),
		TelegramBotToken:     getenv("TELEGRAM_BOT_TOKEN", ""),
		TelegramEnabled:      getenv("TELEGRAM_ENABLED", "false") == "true",
		UploadDir:            getenv("UPLOAD_DIR", "uploads"),
		TronExplorerTxURL:    getenv("TRON_EXPLORER_TX_URL", "https://tronscan.org/#/transaction/%s"),
		BSCExplorerTxURL:     getenv("BSC_EXPLORER_TX_URL", "https://bscscan.com/tx/%s"),
	}
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
