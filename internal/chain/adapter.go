package chain

import (
	"context"

	"github.com/pooli-shop/pooli/internal/domain"
)

type Adapter interface {
	Network() string
	ValidateAddress(address string) error
	NormalizeAddress(address string) string
	ObserveTransfers(ctx context.Context, watchedAddresses []string, tokenContract string, fromCursor string) ([]domain.ChainEvent, string, error)
	VerifyTransfer(ctx context.Context, event domain.ChainEvent) (domain.ChainEvent, error)
	ConfirmationStatus(ctx context.Context, event domain.ChainEvent) (int, error)
	BuildPaymentHandoff(destination string, amountBaseUnits int64, tokenContract string) string
}
