-- Durable record of block ranges a watcher skipped on purpose.
-- Checkout stays closed for that network until an operator acknowledges the rows.
CREATE TABLE IF NOT EXISTS watcher_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network TEXT NOT NULL CHECK (network IN ('tron', 'bsc')),
    from_block BIGINT NOT NULL,
    to_block BIGINT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ NULL,
    acknowledged_by TEXT NULL,
    CHECK (to_block >= from_block)
);

CREATE INDEX IF NOT EXISTS watcher_gaps_open_idx
    ON watcher_gaps (network, created_at DESC)
    WHERE acknowledged_at IS NULL;
