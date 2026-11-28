-- Multiple API keys can belong to one customer project.
-- Only SHA-256 hashes are stored.

CREATE TABLE public.project_api_keys (
    id TEXT PRIMARY KEY,

    project_id TEXT NOT NULL
        REFERENCES public.projects(id)
        ON DELETE RESTRICT,

    name VARCHAR(100) NOT NULL,

    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    CHECK (LENGTH(TRIM(name)) > 0),
    CHECK (LENGTH(TRIM(key_prefix)) > 0),
    CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX idx_project_api_keys_project_id
    ON public.project_api_keys(project_id);
