-- Large batches (feat/large-batches): Web Risk re-checks.
--
-- qr_code.web_risk_recheck_at is set when a code's destination wasn't looked
-- up in Google Web Risk when it was created: a batch of up to 1,000 codes
-- stops waiting for Web Risk after 20 s (the rest get the offline checks),
-- or Web Risk didn't answer. The app looks those destinations up after the
-- response and again from the webhook worker (GitHub Actions every 5
-- minutes), switches off any that Web Risk flags (with an "auto-threat"
-- report for /admin/abuse), and clears the column. NULL means nothing is
-- pending, which is every code made before this column existed.
--
-- Additive and idempotent: one nullable column without a default (a
-- metadata-only change, no table rewrite) and a partial index that only
-- holds pending rows (so it stays tiny), both IF NOT EXISTS; safe to run
-- more than once.
--
-- Order: apply it BEFORE deploying the code that uses it. The code reads
-- and writes qr_code rows with every column of schema.ts, so until the
-- column exists, creating, listing and redirecting codes fail.
--
-- Rollback: the code before this feature never reads the column, so it can
-- stay. To remove it:
--   DROP INDEX IF EXISTS qr_code_web_risk_recheck_at_idx;
--   ALTER TABLE qr_code DROP COLUMN IF EXISTS web_risk_recheck_at;

ALTER TABLE "qr_code" ADD COLUMN IF NOT EXISTS "web_risk_recheck_at" timestamp;

CREATE INDEX IF NOT EXISTS "qr_code_web_risk_recheck_at_idx"
  ON "qr_code" ("web_risk_recheck_at")
  WHERE "web_risk_recheck_at" IS NOT NULL;
