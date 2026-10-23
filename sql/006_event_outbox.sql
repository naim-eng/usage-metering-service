BEGIN;

CREATE TABLE IF NOT EXISTS outbox_events (
    id BIGSERIAL PRIMARY KEY,

    event_type VARCHAR(100) NOT NULL,

    deduplication_key VARCHAR(255) NOT NULL UNIQUE,

    payload JSONB NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    attempts INTEGER NOT NULL DEFAULT 0,

    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    processed_at TIMESTAMPTZ,

    last_error TEXT,

    CONSTRAINT outbox_event_status_check
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    CONSTRAINT outbox_event_attempts_check
        CHECK (attempts >= 0),

    CONSTRAINT outbox_event_payload_check
        CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending
ON outbox_events (available_at, id)
WHERE status = 'pending';

COMMIT;
