-- API keys (Settings → Developers): one new table, api_key.
--
-- Additive and idempotent: safe to run more than once, in one transaction. It
-- creates a new table and its indexes and changes no existing table or
-- column, so the code deployed today (which never reads api_key) keeps
-- working. Apply it BEFORE deploying the code that reads it. If the code goes
-- out first anyway, it fails safe: a `qrdx_` key gets 401 INVALID_TOKEN and
-- Settings → Developers says keys aren't available, with no 500s.
--
-- Only key_hash (SHA-256, hex) is stored, never the key. Deleting the creator
-- or the team deletes their keys (ON DELETE cascade on both foreign keys).
--
-- Constraint and index names match what drizzle-kit generates from
-- packages/database/schema.ts, so a later `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "api_key" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "start" text NOT NULL,
  "user_id" text NOT NULL,
  "organization_id" text,
  "scopes" json NOT NULL,
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);

DO $$ BEGIN
  ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "api_key_user_id_idx" ON "api_key" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "api_key_organization_id_idx" ON "api_key" USING btree ("organization_id");

COMMIT;
