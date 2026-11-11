-- Agency tools: client-branded shared stats pages (Pro and Business), a
-- read-only client portal and its branding (Business).
--
-- 1. brand_kit.purpose (nullable text). Client brands and the portal's
--    branding are brand_kit rows: name, logo and colors->>'accent'.
--    NULL is an older QR design kit (brand kits were merged into saved
--    themes); the app never shows those as client brands.
-- 2. code_public_stats.brand_kit_id and .domain_id (nullable text, both
--    ON DELETE SET NULL): the client brand a shared stats page shows, and
--    the verified custom domain its link is served on. NULL keeps every
--    existing shared link exactly as it is today.
-- 3. portal_client and portal_client_folder: the people a workspace invited
--    to /portal/<workspace-slug> and the folders each may see. They are
--    never workspace members. Removing a client, a folder or the workspace
--    removes their rows (ON DELETE CASCADE); a client's account being
--    deleted only empties user_id.
--
-- Additive and idempotent: new nullable columns, two new tables, their
-- foreign keys and indexes. Safe to run more than once, in one
-- transaction. No existing column changes, nothing is dropped or renamed.
--
-- Order: apply it BEFORE deploying the code that reads it. Without it:
-- turning a code's shared stats page on, off or resetting its link keeps
-- working (those queries read only the old columns), but the share
-- dialog's client branding and link address say they aren't available,
-- the Client portal settings page says the same, and /portal pages are
-- 404s.
--
-- Rollback: the code before this feature never reads these columns or
-- tables, so it keeps working with them present. Leave them in place when
-- rolling back; dropping them is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   \d brand_kit            -- purpose text
--   \d code_public_stats    -- brand_kit_id, domain_id
--   SELECT count(*) FROM portal_client;         -- 0 right after
--   SELECT count(*) FROM portal_client_folder;  -- 0 right after
--
-- Names match what drizzle-kit generates from packages/database/schema.ts,
-- so a later `drizzle-kit push` sees no drift.

BEGIN;

ALTER TABLE "brand_kit" ADD COLUMN IF NOT EXISTS "purpose" text;

ALTER TABLE "code_public_stats" ADD COLUMN IF NOT EXISTS "brand_kit_id" text;
ALTER TABLE "code_public_stats" ADD COLUMN IF NOT EXISTS "domain_id" text;

CREATE TABLE IF NOT EXISTS "portal_client" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "user_id" text,
  "invited_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "accepted_at" timestamp,
  "last_seen_at" timestamp
);

CREATE TABLE IF NOT EXISTS "portal_client_folder" (
  "client_id" text NOT NULL,
  "folder_id" text NOT NULL,
  CONSTRAINT "portal_client_folder_client_id_folder_id_pk"
    PRIMARY KEY ("client_id", "folder_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'code_public_stats_brand_kit_id_brand_kit_id_fk'
  ) THEN
    ALTER TABLE "code_public_stats"
      ADD CONSTRAINT "code_public_stats_brand_kit_id_brand_kit_id_fk"
      FOREIGN KEY ("brand_kit_id") REFERENCES "public"."brand_kit"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'code_public_stats_domain_id_custom_domain_id_fk'
  ) THEN
    ALTER TABLE "code_public_stats"
      ADD CONSTRAINT "code_public_stats_domain_id_custom_domain_id_fk"
      FOREIGN KEY ("domain_id") REFERENCES "public"."custom_domain"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portal_client_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "portal_client"
      ADD CONSTRAINT "portal_client_organization_id_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portal_client_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "portal_client"
      ADD CONSTRAINT "portal_client_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portal_client_folder_client_id_portal_client_id_fk'
  ) THEN
    ALTER TABLE "portal_client_folder"
      ADD CONSTRAINT "portal_client_folder_client_id_portal_client_id_fk"
      FOREIGN KEY ("client_id") REFERENCES "public"."portal_client"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portal_client_folder_folder_id_folder_id_fk'
  ) THEN
    ALTER TABLE "portal_client_folder"
      ADD CONSTRAINT "portal_client_folder_folder_id_folder_id_fk"
      FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "portal_client_organization_id_email_unique"
  ON "portal_client" USING btree ("organization_id", "email");
CREATE INDEX IF NOT EXISTS "portal_client_user_id_idx"
  ON "portal_client" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "portal_client_folder_folder_id_idx"
  ON "portal_client_folder" USING btree ("folder_id");

COMMIT;
