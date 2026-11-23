-- Projects belong to customer organizations.
CREATE TABLE public.projects (
    id TEXT PRIMARY KEY,

    organization_id TEXT NOT NULL
        REFERENCES auth.organization(id)
        ON DELETE RESTRICT,

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,

    metering_account_id BIGINT UNIQUE
        REFERENCES public.accounts(id)
        ON DELETE RESTRICT,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'failed')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (organization_id, slug),

    CHECK (LENGTH(TRIM(name)) > 0),
    CHECK (LENGTH(TRIM(slug)) > 0),
    CHECK (
        status <> 'active'
        OR metering_account_id IS NOT NULL
    )
);
