package chain

import (
	"context"
	"fmt"
	"strings"

	"github.com/pooli-shop/pooli/internal/domain"
)

// NoopAdapter validates addresses for local/dev when RPC is unavailable.
type NoopAdapter struct {
	Name string
}

func (n *NoopAdapter) Network() string { return n.Name }

func (n *NoopAdapter) ValidateAddress(address string) error {
	if n.Name == domain.NetworkBSC {
		if !strings.HasPrefix(strings.ToLower(address), "0x") || len(address) != 42 {
			return fmt.Errorf("invalid EVM address")
		}
		return nil
	}
	if !strings.HasPrefix(address, "T") || len(address) < 30 {
		return fmt.Errorf("invalid TRON address")
	}
	return nil
}

func (n *NoopAdapter) NormalizeAddress(address string) string {
	if n.Name == domain.NetworkBSC {
		return strings.ToLower(address)
	}
	return address
}

func (n *NoopAdapter) ObserveTransfers(ctx context.Context, watchedAddresses []string, tokenContract string, fromCursor string) ([]domain.ChainEvent, string, error) {
	return nil, fromCursor, nil
}

func (n *NoopAdapter) VerifyTransfer(ctx context.Context, event domain.ChainEvent) (domain.ChainEvent, error) {
	return event, nil
}

func (n *NoopAdapter) ConfirmationStatus(ctx context.Context, event domain.ChainEvent) (int, error) {
	return event.Confirmations, nil
}

func (n *NoopAdapter) BuildPaymentHandoff(destination string, amountBaseUnits int64, tokenContract string) string {
	return destination
}
