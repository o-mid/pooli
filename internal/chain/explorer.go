package chain

import "fmt"

// ExplorerTxURL returns a public block-explorer URL for a transaction hash.
func ExplorerTxURL(network, txHash string) string {
	switch network {
	case "tron":
		return fmt.Sprintf("https://tronscan.org/#/transaction/%s", txHash)
	case "bsc":
		return fmt.Sprintf("https://bscscan.com/tx/%s", txHash)
	default:
		return ""
	}
}

// ExplorerAddressURL returns a public block-explorer URL for an address.
func ExplorerAddressURL(network, address string) string {
	switch network {
	case "tron":
		return fmt.Sprintf("https://tronscan.org/#/address/%s", address)
	case "bsc":
		return fmt.Sprintf("https://bscscan.com/address/%s", address)
	default:
		return ""
	}
}
