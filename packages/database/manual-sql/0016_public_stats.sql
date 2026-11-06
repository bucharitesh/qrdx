-- Public analytics pages: one new table,
-- code_public_stats. A row turns on /stats/<token> for one dynamic code: a
-- read-only page with scans over time, top countries, devices and referrer
-- hosts. Deleting the row turns it off; a new token resets the link.
--
-- Written by the code-features agent (2026-11-04). NOT APPLIED. Until it is,
-- "Share analytics…" says sharing isn't available yet and /stats/<token> is
-- a 404 (apps/docs/lib/public-stats.ts treats the missing table as "off").
--
-- Additive and idempotent: safe to run more than once, in one transaction.
-- It creates one table, one foreign key and two unique indexes, and changes
-- no existing table or column (qr_code is untouched, so queries that read
-- whole qr_code rows keep working before and after).
--
-- token: 32 URL-safe random characters (24 bytes), unique. created_by: user
-- id, no foreign key, like qr_code_version.created_by. Deleting the code
-- deletes its row.
--
-- Matches packages/database/schema.ts `codePublicStats`.

BEGIN;

CREATE TABLE IF NOT EXISTS "code_public_stats" (
  "id" text PRIMARY KEY NOT NULL,
  "qr_code_id" text NOT NULL,
  "token" text NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "code_public_stats" ADD CONSTRAINT "code_public_stats_qr_code_id_qr_code_id_fk"
    FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_code"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "code_public_stats_qr_code_id_unique"
  ON "code_public_stats" USING btree ("qr_code_id");
CREATE UNIQUE INDEX IF NOT EXISTS "code_public_stats_token_unique"
  ON "code_public_stats" USING btree ("token");

COMMIT;
