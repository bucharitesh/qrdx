-- New sign-in alerts: one new table, known_device, for the browsers and
-- devices that have finished signing in to each account
-- (packages/auth/new-sign-in.ts). A sign-in from a browser the account hasn't
-- seen is emailed about.
--
-- A browser is known by a random 32-byte cookie (qrdx_device, HttpOnly,
-- 400 days). Only its SHA-256 is stored in device_hash, never the cookie.
-- user_agent is the browser's own description, kept to show which browser a
-- row is; it can be null. alerted_at is set on the browsers that got an
-- alert: an account gets at most 10 in 24 hours.
--
-- Rows stay bounded: the plugin keeps each account's 50 most recently seen
-- browsers, and the daily cron (apps/docs/lib/auth/verification-prune.ts)
-- deletes rows whose last_seen_at is more than 400 days old.
--
-- Additive and idempotent: a new table only, safe to run more than once, in
-- one transaction. No existing table or column changes. A database that ran
-- the first version of this file (without alerted_at) gets the column from
-- the ADD COLUMN IF NOT EXISTS below.
--
-- Rollback: the code before this feature (f4dc0a2c) never reads or writes
-- this table, so it keeps working with the table present (checked by
-- reading f4dc0a2c: no reference to the table, the column or the
-- qrdx_device cookie, and Drizzle and Better Auth only use the tables the
-- code declares). Leave the table in place when rolling back; dropping it
-- is a separate change.
--
-- Order: apply it BEFORE deploying the code that registers the plugin. If
-- the code runs first, the plugin's reads fail; it logs the error and lets
-- the sign-in finish (no alert, nothing recorded), so nobody is locked out,
-- but alerts don't work until this is applied.
--
-- Existing accounts start with no known devices. The plugin records the
-- first sign-in it sees for an account without an alert, so nobody is
-- emailed just because this shipped.
--
-- Deletes: deleting a user deletes their rows (ON DELETE cascade).
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   SELECT count(*) FROM known_device;  -- 0 right after
--   \d known_device
--
-- Names match what drizzle-kit generates from packages/database/schema.ts
-- (knownDevice), so a later `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "known_device" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "device_hash" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "last_seen_at" timestamp NOT NULL,
  "user_agent" text,
  "alerted_at" timestamp
);

ALTER TABLE "known_device" ADD COLUMN IF NOT EXISTS "alerted_at" timestamp;

DO $$ BEGIN
  ALTER TABLE "known_device" ADD CONSTRAINT "known_device_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "known_device_user_id_device_hash_unique"
  ON "known_device" USING btree ("user_id", "device_hash");

COMMIT;
