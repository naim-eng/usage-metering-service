CREATE TABLE plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    plan_type VARCHAR(20) NOT NULL
        CHECK (plan_type IN ('account', 'user')),

    owner_account_id BIGINT,

    monthly_limit BIGINT NOT NULL
        CHECK (monthly_limit >= 0),

    max_per_request BIGINT NOT NULL
        CHECK (max_per_request > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    api_key_hash VARCHAR(64) NOT NULL UNIQUE,

    plan_id BIGINT NOT NULL
        REFERENCES plans(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id BIGINT NOT NULL
        REFERENCES accounts(id),

    external_user_id VARCHAR(100) NOT NULL,

    plan_id BIGINT NOT NULL
        REFERENCES plans(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (account_id, external_user_id)
);

CREATE TABLE monthly_usage (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id BIGINT NOT NULL
        REFERENCES accounts(id),

    user_id BIGINT
        REFERENCES users(id),

    month_start DATE NOT NULL,

    units_used BIGINT NOT NULL DEFAULT 0
        CHECK (units_used >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id BIGINT NOT NULL
        REFERENCES accounts(id),

    user_id BIGINT NOT NULL
        REFERENCES users(id),

    request_id VARCHAR(100) NOT NULL,

    units_requested BIGINT NOT NULL
        CHECK (units_requested > 0),

    accepted BOOLEAN NOT NULL,

    rejection_scope VARCHAR(20)
        CHECK (rejection_scope IN ('account', 'user')),

    rejection_rule VARCHAR(50),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (account_id, request_id)
);

-- Custom plans must belong to an existing account.
ALTER TABLE plans
ADD CONSTRAINT fk_plan_owner
FOREIGN KEY (owner_account_id)
REFERENCES accounts(id);

-- Prevent duplicate account usage rows per month.
CREATE UNIQUE INDEX unique_account_monthly_usage
ON monthly_usage (account_id, month_start)
WHERE user_id IS NULL;

-- Prevent duplicate user usage rows per month.
CREATE UNIQUE INDEX unique_user_monthly_usage
ON monthly_usage (user_id, month_start)
WHERE user_id IS NOT NULL;

-- Ensure each usage record points to a valid account/user pair.
ALTER TABLE users
ADD CONSTRAINT unique_user_account_pair
UNIQUE (account_id, id);

ALTER TABLE monthly_usage
ADD CONSTRAINT fk_monthly_usage_user_account
FOREIGN KEY (account_id, user_id)
REFERENCES users(account_id, id);

ALTER TABLE usage_requests
ADD CONSTRAINT fk_usage_request_user_account
FOREIGN KEY (account_id, user_id)
REFERENCES users(account_id, id);


-- Ensure usage months always begin on the first day.
ALTER TABLE monthly_usage
ADD CONSTRAINT valid_month_start
CHECK (EXTRACT(DAY FROM month_start) = 1);


-- Provide efficient account history lookups.
CREATE INDEX idx_usage_requests_history
ON usage_requests (account_id, created_at DESC, id DESC);

-- Provide efficient user history lookups.
CREATE INDEX idx_usage_requests_user_history
ON usage_requests (account_id, user_id, created_at DESC);

-- Accepted requests have no rejection reason.
-- Rejected requests must identify a scope and rule.
ALTER TABLE usage_requests
ADD CONSTRAINT valid_request_decision
CHECK (
    (
        accepted = TRUE
        AND rejection_scope IS NULL
        AND rejection_rule IS NULL
    )
    OR
    (
        accepted = FALSE
        AND rejection_scope IS NOT NULL
        AND rejection_rule IS NOT NULL
    )
);

-- Speed up finding plans belonging to an account.
CREATE INDEX idx_plans_owner
ON plans (owner_account_id, plan_type);

-- Speed up finding users belonging to an account.
CREATE INDEX idx_users_account
ON users (account_id);
