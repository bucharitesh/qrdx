-- Precise scan location (opt-in per code) and geofence routing: four new
-- nullable columns on qr_scan.
--
--   latitude, longitude   Where the scanner was, rounded to 3 decimal places
--                         (about 100 m) in their browser before it is sent,
--                         and rounded again on the server. Only set when the
--                         code's owner turned on "Ask scanners for precise
--                         location" (Pro and Business) AND the scanner
--                         allowed it in the browser. Never raw values.
--   location_accuracy_m   The accuracy the browser reported, in whole meters.
--   location_source       'gps': the scanner shared their location (the three
--                         columns above are set). 'ip': the code asked but the
--                         scanner skipped, declined, or the browser timed out;
--                         nothing else is stored and the scan's location is the
--                         usual network one (country, region, city). NULL: the
--                         code didn't ask (every scan before this change, and
--                         every code with the setting off).
--
-- The per-code setting needs no SQL: it is `preciseLocation` inside the
-- existing qr_code.pixels JSON (apps/docs/lib/redirect/routing.ts
-- pixelConfigSchema), so the short-link lookup reads nothing new.
--
-- Additive and idempotent: safe to run more than once, in one transaction.
-- Nullable columns without defaults: no table rewrite, no backfill, existing
-- rows read as NULL. No index (the analytics read these columns only within
-- one code's scans, through qr_scan_qr_code_id_scanned_at_idx).
--
-- Order: apply BEFORE deploying the code. The app inserts every qr_scan
-- column it knows about, so until these exist scan recording fails (the
-- redirect itself still works: recording runs after the response and its
-- errors are logged). Another change of 2026-11-11 (nfc) also adds a qr_scan
-- column; the two files are independent and can run in either order.
--
-- Rollback: code from before this change never reads these columns, so it
-- keeps working with them present. Leave them in place when rolling back;
-- dropping them is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the ALTER TABLE below>; ROLLBACK;
-- After running, check:
--   \d qr_scan
--   SELECT count(*) FROM qr_scan WHERE location_source IS NOT NULL;  -- 0 right after
--
-- Matches packages/database/schema.ts `qrScan`.

BEGIN;

ALTER TABLE "qr_scan"
  ADD COLUMN IF NOT EXISTS "latitude" double precision,
  ADD COLUMN IF NOT EXISTS "longitude" double precision,
  ADD COLUMN IF NOT EXISTS "location_accuracy_m" integer,
  ADD COLUMN IF NOT EXISTS "location_source" text;

COMMIT;
