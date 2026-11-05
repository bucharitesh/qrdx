-- Backfill: WhatsApp dynamic codes created before 2026-11-05 were stored with
-- content_type 'url' (createCodes never set it). New codes and destination
-- edits now get 'whatsapp' from apps/docs/lib/dynamic-content.ts
-- contentTypeForDestination(); this moves the old rows over to match.
--
-- Written by the small-fixes agent (2026-11-05). NOT APPLIED. Nothing reads
-- content_type to decide behaviour yet (it is shown in the REST API, the
-- account export and copied by Duplicate), so old rows only report 'url'
-- until this runs.
--
-- Data only, no schema change. Idempotent: it only touches rows still on
-- 'url', so a second run updates nothing. It leaves updated_at alone.
-- The patterns match contentTypeForDestination(): wa.me (with or without
-- www.), and /send on whatsapp.com, www.whatsapp.com or api.whatsapp.com.
-- chat.whatsapp.com group invites stay 'url'.
--
-- 1. Look first: the rows that would change.

SELECT id, destination_url, content_type, created_at
FROM "qr_code"
WHERE content_type = 'url'
  AND (
    destination_url ~* '^https?://(www\.)?wa\.me([/?#]|$)'
    OR destination_url ~* '^https?://(www\.|api\.)?whatsapp\.com/send/*([?#]|$)'
  )
ORDER BY created_at;

-- 2. Then update them (same WHERE clause).

BEGIN;

UPDATE "qr_code"
SET content_type = 'whatsapp'
WHERE content_type = 'url'
  AND (
    destination_url ~* '^https?://(www\.)?wa\.me([/?#]|$)'
    OR destination_url ~* '^https?://(www\.|api\.)?whatsapp\.com/send/*([?#]|$)'
  );

COMMIT;
