BEGIN;

CREATE TABLE IF NOT EXISTS low_credit_notifications (
    id BIGSERIAL PRIMARY KEY,

    account_id BIGINT NOT NULL
        REFERENCES accounts(id),

    user_id BIGINT,

    month_start DATE NOT NULL,

    threshold_percent INTEGER NOT NULL,

    monthly_limit BIGINT NOT NULL,

    units_used BIGINT NOT NULL,

    remaining_credits BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT low_credit_notification_threshold_check
        CHECK (threshold_percent IN (80, 90, 100)),

    CONSTRAINT low_credit_notification_values_check
        CHECK (
            monthly_limit > 0
            AND units_used >= 0
            AND remaining_credits >= 0
        ),

    CONSTRAINT low_credit_notification_user_fk
        FOREIGN KEY (account_id, user_id)
        REFERENCES users(account_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_low_credit_notifications_account_threshold
ON low_credit_notifications (
    account_id,
    month_start,
    threshold_percent
)
WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_low_credit_notifications_user_threshold
ON low_credit_notifications (
    account_id,
    user_id,
    month_start,
    threshold_percent
)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS
    idx_low_credit_notifications_history
ON low_credit_notifications (
    account_id,
    created_at DESC,
    id DESC
);

COMMIT;
