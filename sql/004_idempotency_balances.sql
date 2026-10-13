
-- Migration 004: Preserve original balances for idempotent retries.
--
-- Both fields are nullable because historical requests
-- were recorded before these values were stored.
--
-- New requests will populate both fields atomically
-- with the consumption decision.

BEGIN;

ALTER TABLE usage_requests
ADD COLUMN IF NOT EXISTS account_remaining_after BIGINT
    CHECK (account_remaining_after >= 0);

ALTER TABLE usage_requests
ADD COLUMN IF NOT EXISTS user_remaining_after BIGINT
    CHECK (user_remaining_after >= 0);

COMMIT;
