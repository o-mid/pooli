package ops

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrSnapBlocked is returned when a cursor snap would skip blocks that may
// still belong to a live payment option.
var ErrSnapBlocked = errors.New("cursor snap refused: active payment options")

// UnackedGapCounts returns unacknowledged watcher_gaps grouped by network.
func UnackedGapCounts(ctx context.Context, pool *pgxpool.Pool) (map[string]int, error) {
	rows, err := pool.Query(ctx, `
		SELECT network, COUNT(*)
		FROM watcher_gaps
		WHERE acknowledged_at IS NULL
		GROUP BY network`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var net string
		var n int
		if err := rows.Scan(&net, &n); err != nil {
			return nil, err
		}
		out[net] = n
	}
	return out, rows.Err()
}

// CountActivePaymentOptions counts options whose intent is still in a state
// where a skipped block could hide a real payment.
func CountActivePaymentOptions(ctx context.Context, pool *pgxpool.Pool, network string) (int, error) {
	var n int
	err := pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM payment_options po
		JOIN payment_intents pi ON pi.id = po.payment_intent_id
		WHERE po.network = $1
		  AND pi.status IN ('AWAITING_PAYMENT', 'SEEN', 'CONFIRMING')`, network).Scan(&n)
	return n, err
}

// RecordWatcherGap inserts one durable skipped-range row.
func RecordWatcherGap(ctx context.Context, pool *pgxpool.Pool, network string, fromBlock, toBlock uint64, reason string) error {
	if toBlock < fromBlock {
		return fmt.Errorf("invalid watcher gap")
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO watcher_gaps (network, from_block, to_block, reason)
		VALUES ($1, $2, $3, $4)`, network, int64(fromBlock), int64(toBlock), reason)
	return err
}

// GateCursorSnap refuses the snap when live options exist, otherwise records the gap.
func GateCursorSnap(ctx context.Context, pool *pgxpool.Pool, network string, fromBlock, toBlock uint64, reason string) error {
	n, err := CountActivePaymentOptions(ctx, pool, network)
	if err != nil {
		return err
	}
	if n > 0 {
		return ErrSnapBlocked
	}
	return RecordWatcherGap(ctx, pool, network, fromBlock, toBlock, reason)
}

// AcknowledgeWatcherGaps marks open gaps for one network as reviewed.
func AcknowledgeWatcherGaps(ctx context.Context, pool *pgxpool.Pool, network, actor string) (int, error) {
	tag, err := pool.Exec(ctx, `
		UPDATE watcher_gaps
		SET acknowledged_at = now(), acknowledged_by = $2
		WHERE network = $1 AND acknowledged_at IS NULL`, network, actor)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
