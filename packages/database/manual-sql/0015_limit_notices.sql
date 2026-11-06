-- Plan-limit emails: one new table, limit_notice.
-- When a workspace reaches 90% and again 100% of a capped limit in
-- apps/docs/lib/plans.ts (dynamic codes, hosted pages, saved themes, file
-- storage, AI art, form responses), its owners get one email per limit,
-- threshold and calendar month. A row here means "already sent"; the app
-- inserts it first (ON CONFLICT DO NOTHING) and only the request that
-- inserted it sends the email (apps/docs/lib/limit-notices/notify.tsx).
--
-- Written by the code-features agent (2026-11-04). NOT APPLIED. Until it is,
-- the app's insert fails with "relation does not exist", which it treats as
-- "notices off": nothing is sent and nothing errors.
--
-- Additive and idempotent: safe to run more than once, in one transaction.
-- It creates one table, one foreign key and one unique index, and changes
-- no existing table or column.
--
-- subject: '' for a limit of the whole workspace, else the user id of an
-- allowance counted per person (AI art on plans that don't pool it). Plain
-- text, no foreign key, like qr_code.slug_scope.
-- Deleting the workspace deletes its rows.
--
-- Matches packages/database/schema.ts `limitNotice`.

BEGIN;

CREATE TABLE IF NOT EXISTS "limit_notice" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "limit_id" text NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "period" text NOT NULL,
  "threshold" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "limit_notice" ADD CONSTRAINT "limit_notice_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "limit_notice_once_unique"
  ON "limit_notice" USING btree
  ("organization_id", "limit_id", "subject", "period", "threshold");

COMMIT;
