-- Workspace join links (Settings → Team, the Dub study's gap 4): one new
-- table, workspace_join_link. Owners and admins make a link
-- (/join/<token>) that lets anyone signed in join the workspace as a member,
-- or as the role they picked (never owner), while the plan has seats. They
-- can reset it (a new token) or turn it off (the row is deleted).
--
-- Additive and idempotent: safe to run more than once, in one transaction. It
-- creates a new table and changes no existing table or column, so the code
-- deployed today (which never reads workspace_join_link) keeps working.
-- Apply it BEFORE deploying the code that reads it. If the code goes out
-- first anyway, it fails safe: Settings → Team says join links aren't set up
-- yet, and /join/<token> says the link can't be used right now, with no 500s.
--
-- One row per workspace (organization_id is the primary key). Only
-- token_hash (SHA-256, hex) is stored, never the token. Deleting the
-- workspace deletes its link (ON DELETE cascade); deleting the person who
-- made it keeps the link (created_by is set null).
--
-- Constraint and index names match what drizzle-kit generates from
-- packages/database/schema.ts (workspaceJoinLink), so a later
-- `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "workspace_join_link" (
  "organization_id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "created_by" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "workspace_join_link_token_hash_unique" UNIQUE("token_hash")
);

DO $$ BEGIN
  ALTER TABLE "workspace_join_link" ADD CONSTRAINT "workspace_join_link_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workspace_join_link" ADD CONSTRAINT "workspace_join_link_created_by_user_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "workspace_join_link_created_by_idx"
  ON "workspace_join_link" USING btree ("created_by");

COMMIT;
