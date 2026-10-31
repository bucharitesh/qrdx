-- Self-serve OAuth apps (Settings → Developers): owner, team, branding,
-- verification and PKCE flags on oauth_app, plus a lookup index on
-- oauth_token.
--
-- Additive and idempotent: safe to run more than once, in one transaction.
-- Every new column is nullable or has a default, so the code deployed today
-- (which never selects or inserts these columns) keeps working. Existing apps
-- get owner_user_id = NULL (first-party, registered by the QRdx team),
-- verified = false and pkce_required = false, which keeps their behaviour.
--
-- Constraint and index names match what drizzle-kit generates from
-- packages/database/schema.ts, so a later `drizzle-kit push` sees no drift.

BEGIN;

ALTER TABLE "oauth_app" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "oauth_app" ADD COLUMN IF NOT EXISTS "organization_id" text;
ALTER TABLE "oauth_app" ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE "oauth_app" ADD COLUMN IF NOT EXISTS "website_url" text;
ALTER TABLE "oauth_app" ADD COLUMN IF NOT EXISTS "verified" boolean DEFAULT false NOT NULL;
ALTER TABLE "oauth_app" ADD COLUMN IF NOT EXISTS "pkce_required" boolean DEFAULT false NOT NULL;
ALTER TABLE "oauth_app" ADD COLUMN IF NOT EXISTS "secret_rotated_at" timestamp;

DO $$ BEGIN
  ALTER TABLE "oauth_app" ADD CONSTRAINT "oauth_app_owner_user_id_user_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "oauth_app" ADD CONSTRAINT "oauth_app_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "oauth_app_owner_user_id_idx" ON "oauth_app" USING btree ("owner_user_id");
CREATE INDEX IF NOT EXISTS "oauth_app_organization_id_idx" ON "oauth_app" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "oauth_token_app_id_user_id_idx" ON "oauth_token" USING btree ("app_id","user_id");

COMMIT;
