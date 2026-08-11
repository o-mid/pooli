-- Worker liveness for ops status / uptime checks.
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_name TEXT PRIMARY KEY,
    last_beat_at TIMESTAMPTZ NOT NULL,
    meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worker_heartbeats_last_beat_idx
    ON worker_heartbeats (last_beat_at DESC);
