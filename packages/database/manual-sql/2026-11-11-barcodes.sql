-- Saved barcodes: one new table, barcode, for static barcodes (EAN-13, UPC,
-- Code 128, GS1-128, ITF-14, Data Matrix, PDF417, Aztec, ...) kept in a
-- workspace to edit and download again. Barcodes are static: the bars hold
-- the data, so nothing is hosted and nothing is counted on scan.
--
-- Each row: the workspace (organization_id) and the person who made it
-- (user_id), an optional folder (the codes' folders), a title, the
-- symbology (format), the value drawn (check digit included), how it's
-- drawn (options: colors, bar height, quiet zone, scale, text, rotation),
-- and deleted_at for the trash (restorable).
--
-- Foreign keys match the other workspace tables (qr_code, landing_page):
-- user_id cascades with the account, organization_id and folder_id are set
-- to NULL when the workspace or folder goes (the app hands a deleted
-- workspace's rows back to their creators first, like codes).
--
-- Additive and idempotent: a new table, its foreign keys and indexes only,
-- safe to run more than once, in one transaction. No existing table or
-- column changes.
--
-- Order: apply it BEFORE deploying the code that reads it. Without the
-- table, the Barcodes section, "Save to dashboard", /v1/barcodes and the MCP
-- save_barcode tool fail, and so do deleting a workspace and deleting an
-- account (they hand barcode rows back like codes). The public image API
-- (/v1/barcode), the generator's downloads and the MCP generate_barcode
-- tool don't touch the database and work either way.
--
-- Rollback: the code before this feature never reads or writes this table,
-- so it keeps working with the table present. Leave the table in place when
-- rolling back; dropping it is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   SELECT count(*) FROM barcode;  -- 0 right after
--   \d barcode
--
-- Names match what drizzle-kit generates from packages/database/schema.ts
-- (barcode), so a later `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "barcode" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "organization_id" text,
  "folder_id" text,
  "title" text,
  "format" text NOT NULL,
  "value" text NOT NULL,
  "options" jsonb,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'barcode_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "barcode" ADD CONSTRAINT "barcode_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'barcode_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "barcode" ADD CONSTRAINT "barcode_organization_id_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'barcode_folder_id_folder_id_fk'
  ) THEN
    ALTER TABLE "barcode" ADD CONSTRAINT "barcode_folder_id_folder_id_fk"
      FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "barcode_user_id_idx"
  ON "barcode" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "barcode_organization_id_idx"
  ON "barcode" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "barcode_folder_id_idx"
  ON "barcode" USING btree ("folder_id");

COMMIT;
