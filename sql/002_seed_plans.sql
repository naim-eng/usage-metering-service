INSERT INTO plans (
    name,
    plan_type,
    owner_account_id,
    monthly_limit,
    max_per_request
)
VALUES
    ('Starter', 'account', NULL, 100, 20),
    ('Pro', 'account', NULL, 1000, 100),
    ('Basic', 'user', NULL, 10, 2),
    ('Premium', 'user', NULL, 100, 10);
