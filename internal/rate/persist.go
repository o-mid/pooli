package rate

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
)

// QuoteMetadataJSON is the non-secret metadata stored with a persisted quote.
func QuoteMetadataJSON(q domain.RateQuote) string {
	b, err := json.Marshal(map[string]any{
		"policy":           q.Policy,
		"source_pair":      q.SourcePair,
		"source_currency":  q.SourceCurrency,
		"display_currency": q.DisplayCurrency,
		"provider":         q.Source,
	})
	if err != nil {
		return "{}"
	}
	return string(b)
}

// PersistQuote writes a live quote so ops/status age stays honest between orders.
// Matching still uses the quote attached to each payment intent.
func PersistQuote(ctx context.Context, pool *pgxpool.Pool, q domain.RateQuote) error {
	if pool == nil {
		return nil
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at, metadata_json)
		VALUES ($1,$2,$3,$4::jsonb)`,
		q.Rate.String(), q.Source, q.FetchedAt, QuoteMetadataJSON(q))
	return err
}
