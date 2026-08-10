package domain

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

const (
	NetworkTRON = "tron"
	NetworkBSC  = "bsc"
	AssetUSDT   = "USDT"
	FiatTMN     = "TMN"
	USDTDecimals = 6
)

const (
	StatusCreated         = "CREATED"
	StatusAwaitingPayment = "AWAITING_PAYMENT"
	StatusSeen            = "SEEN"
	StatusConfirming      = "CONFIRMING"
	StatusPaid            = "PAID"
	StatusExpired         = "EXPIRED"
	StatusUnderpaid       = "UNDERPAID"
	StatusOverpaid        = "OVERPAID"
	StatusLatePayment     = "LATE_PAYMENT"
	StatusNeedsReview     = "NEEDS_REVIEW"
	StatusDuplicatePayment = "DUPLICATE_PAYMENT"
)

type ChainEvent struct {
	EventID          string          `json:"event_id"`
	Network          string          `json:"network"`
	ChainID          *int64          `json:"chain_id,omitempty"`
	TxHash           string          `json:"tx_hash"`
	LogIndex         *int            `json:"log_index,omitempty"`
	TokenContract    string          `json:"token_contract"`
	From             string          `json:"from"`
	To               string          `json:"to"`
	AmountBaseUnits  int64           `json:"amount_base_units"`
	BlockNumber      int64           `json:"block_number"`
	Confirmations    int             `json:"confirmations"`
	ObservedAt       time.Time       `json:"observed_at"`
	Raw              map[string]any  `json:"raw,omitempty"`
}

type RateQuote struct {
	Rate            decimal.Decimal
	Source          string
	FetchedAt       time.Time
	Policy          string // e.g. best_buy, best_sell, latest, mock
	SourcePair      string // e.g. USDT/RLS, USDTTMN
	SourceCurrency  string // IRR or TMN as returned by provider before display normalization
	DisplayCurrency string // TMN for Pooli merchant UX
}

type FieldDef struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Type     string   `json:"type"`
	Required bool     `json:"required"`
	Options  []string `json:"options,omitempty"`
}

type FieldValue struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

func NewID() uuid.UUID { return uuid.New() }

func USDTFromBaseUnits(u int64) decimal.Decimal {
	return decimal.NewFromInt(u).Shift(-USDTDecimals)
}

func USDTToBaseUnits(d decimal.Decimal) int64 {
	return d.Shift(USDTDecimals).Round(0).IntPart()
}
