-- Preserve existing project credentials as individually revocable keys.
-- The original plaintext and display prefix cannot be recovered.

INSERT INTO public.project_api_keys (
    id,
    project_id,
    name,
    key_hash,
    key_prefix,
    created_at
)
SELECT
    gen_random_uuid()::text,
    p.id,
    'Original project key',
    a.api_key_hash,
    'Legacy key',
    a.created_at
FROM public.projects AS p
JOIN public.accounts AS a
    ON a.id = p.metering_account_id;

-- Project-linked accounts no longer authenticate through account hashes.
-- Remove the duplicate credential hash while retaining the NOT NULL schema.

UPDATE public.accounts AS a
SET api_key_hash = encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex')
FROM public.projects AS p
WHERE p.metering_account_id = a.id;
