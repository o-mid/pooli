package ops

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const ChainWorkerName = "chain-worker"

// Beat upserts a worker heartbeat row. Safe to call every poll tick.
func Beat(ctx context.Context, pool *pgxpool.Pool, workerName string, meta map[string]any) error {
	if meta == nil {
		meta = map[string]any{}
	}
	raw, err := json.Marshal(meta)
	if err != nil {
		raw = []byte("{}")
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO worker_heartbeats (worker_name, last_beat_at, meta_json, updated_at)
		VALUES ($1, now(), $2::jsonb, now())
		ON CONFLICT (worker_name) DO UPDATE SET
			last_beat_at = now(),
			meta_json = EXCLUDED.meta_json,
			updated_at = now()`, workerName, string(raw))
	return err
}

// HeartbeatStatus is a safe, non-secret view of worker liveness.
type HeartbeatStatus struct {
	WorkerName string         `json:"worker_name"`
	LastBeatAt *time.Time     `json:"last_beat_at,omitempty"`
	AgeSeconds *float64       `json:"age_seconds,omitempty"`
	OK         bool           `json:"ok"`
	Meta       map[string]any `json:"meta,omitempty"`
}

// LoadHeartbeat returns liveness for one worker. staleAfter controls OK.
func LoadHeartbeat(ctx context.Context, pool *pgxpool.Pool, workerName string, staleAfter time.Duration) (HeartbeatStatus, error) {
	out := HeartbeatStatus{WorkerName: workerName, OK: false}
	var beat time.Time
	var metaRaw []byte
	err := pool.QueryRow(ctx, `
		SELECT last_beat_at, meta_json FROM worker_heartbeats WHERE worker_name=$1`, workerName).
		Scan(&beat, &metaRaw)
	if err != nil {
		return out, err
	}
	out.LastBeatAt = &beat
	age := time.Since(beat).Seconds()
	out.AgeSeconds = &age
	if staleAfter <= 0 {
		staleAfter = 2 * time.Minute
	}
	out.OK = time.Since(beat) <= staleAfter
	_ = json.Unmarshal(metaRaw, &out.Meta)
	return out, nil
}

// CursorStatus reports watcher cursor freshness (non-secret).
type CursorStatus struct {
	Network    string     `json:"network"`
	UpdatedAt  *time.Time `json:"updated_at,omitempty"`
	AgeSeconds *float64   `json:"age_seconds,omitempty"`
	OK         bool       `json:"ok"`
	HasCursor  bool       `json:"has_cursor"`
}

// LoadWatcherCursors returns cursor rows for ops status.
func LoadWatcherCursors(ctx context.Context, pool *pgxpool.Pool, staleAfter time.Duration) ([]CursorStatus, error) {
	if staleAfter <= 0 {
		staleAfter = 5 * time.Minute
	}
	rows, err := pool.Query(ctx, `
		SELECT network, updated_at FROM watcher_cursors ORDER BY network`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CursorStatus
	for rows.Next() {
		var net string
		var updated time.Time
		if err := rows.Scan(&net, &updated); err != nil {
			return nil, err
		}
		age := time.Since(updated).Seconds()
		out = append(out, CursorStatus{
			Network: net, UpdatedAt: &updated, AgeSeconds: &age,
			OK: time.Since(updated) <= staleAfter, HasCursor: true,
		})
	}
	if out == nil {
		out = []CursorStatus{}
	}
	return out, rows.Err()
}
