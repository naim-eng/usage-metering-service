
-- Migration 003: Historical quota-limit tracking
--
-- This migration records snapshots of quota limits for
-- accounts and users as they change over time.
--
-- Existing usage and plan records are not modified.
-- Historical changes from before this migration
-- cannot be reconstructed reliably.

BEGIN;

CREATE TABLE IF NOT EXISTS plan_limit_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id BIGINT NOT NULL
        REFERENCES accounts(id),

    user_id BIGINT,

    plan_id BIGINT NOT NULL
        REFERENCES plans(id),

    plan_name VARCHAR(100) NOT NULL,

    monthly_limit BIGINT NOT NULL
        CHECK (monthly_limit >= 0),

    max_per_request BIGINT NOT NULL
        CHECK (max_per_request > 0),

    effective_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    change_type VARCHAR(30) NOT NULL
        CHECK (
            change_type IN (
                'baseline',
                'account_plan_switch',
                'user_plan_switch',
                'custom_plan_update'
            )
        ),

    CONSTRAINT fk_plan_history_user_account
        FOREIGN KEY (account_id, user_id)
        REFERENCES users(account_id, id)
);

-- Each event captures a quota configuration at a
-- specific point in time.
CREATE INDEX IF NOT EXISTS idx_plan_history_account_time
ON plan_limit_history (
    account_id,
    effective_at DESC,
    id DESC
);

CREATE INDEX IF NOT EXISTS idx_plan_history_user_time
ON plan_limit_history (
    account_id,
    user_id,
    effective_at DESC,
    id DESC
);

-- Create a baseline snapshot for existing accounts.
-- These snapshots describe the limits at migration time,
-- not necessarily the limits from earlier months.
INSERT INTO plan_limit_history (
    account_id,
    user_id,
    plan_id,
    plan_name,
    monthly_limit,
    max_per_request,
    effective_at,
    change_type
)
SELECT
    a.id,
    NULL,
    p.id,
    p.name,
    p.monthly_limit,
    p.max_per_request,
    NOW(),
    'baseline'
FROM accounts a
JOIN plans p ON p.id = a.plan_id
WHERE NOT EXISTS (
    SELECT 1
    FROM plan_limit_history h
    WHERE h.account_id = a.id
      AND h.user_id IS NULL
      AND h.change_type = 'baseline'
);

-- Create a baseline snapshot for existing users.
INSERT INTO plan_limit_history (
    account_id,
    user_id,
    plan_id,
    plan_name,
    monthly_limit,
    max_per_request,
    effective_at,
    change_type
)
SELECT
    u.account_id,
    u.id,
    p.id,
    p.name,
    p.monthly_limit,
    p.max_per_request,
    NOW(),
    'baseline'
FROM users u
JOIN plans p ON p.id = u.plan_id
WHERE NOT EXISTS (
    SELECT 1
    FROM plan_limit_history h
    WHERE h.account_id = u.account_id
      AND h.user_id = u.id
      AND h.change_type = 'baseline'
);

COMMIT;
