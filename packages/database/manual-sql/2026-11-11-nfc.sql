-- NFC taps (feat/nfc): where a scan came from.
--
-- qr_scan.source is 'nfc' when the visit came through a code's NFC link (the
-- short link with ?nfc, written to an NFC tag or card) and 'qr' for every
-- other visit to the short link. Rows recorded before this column existed
-- stay NULL, and the app counts them as QR scans.
--
-- Additive and idempotent: one nullable column, no default, no index, safe
-- to run more than once. Adding a nullable column without a default is a
-- metadata-only change in Postgres (no table rewrite, no long lock).
--
-- Order: apply it BEFORE deploying the code that uses it. Until it exists,
-- short links still redirect (scans are written after the response), but new
-- scans aren't recorded, and the analytics pages, the scans API, the CSV
-- export and shared analytics pages fail, since they all read the column.
--
-- Rollback: the code before this feature never reads the column, so it can
-- stay. To remove it: ALTER TABLE qr_scan DROP COLUMN IF EXISTS source;

ALTER TABLE "qr_scan" ADD COLUMN IF NOT EXISTS "source" text;
