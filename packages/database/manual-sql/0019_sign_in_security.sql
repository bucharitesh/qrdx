-- Sign-in security: two-step verification (authenticator app + backup
-- codes), passkeys and workspace single sign-on (OIDC / SAML, Business).
-- Three new tables (two_factor, passkey, sso_provider) and one new column
-- (user.two_factor_enabled), for better-auth 1.7.14's twoFactor plugin,
-- @better-auth/passkey and @better-auth/sso.
--
-- Additive and idempotent: safe to run more than once, in one transaction.
-- No existing column changes. The new user column is nullable with a default
-- of false, so the code deployed today (which never reads it) keeps working,
-- and every existing account reads as "2FA off".
--
-- Apply it BEFORE deploying the code that registers these plugins: Better
-- Auth reads user.two_factor_enabled on every sign-in once twoFactor is on.
--
-- APPLIED to the shared Neon database on 2026-11-05: dry run in a rolled-back
-- transaction first, then applied, then run again (no errors, no changes).
--
-- Secrets: two_factor.secret and two_factor.backup_codes are encrypted by
-- the plugin with BETTER_AUTH_SECRET. passkey.public_key is public.
-- sso_provider.oidc_config holds the IdP client secret (JSON string), so the
-- table must never be exposed to clients.
--
-- Deletes: deleting a user deletes their 2FA row and passkeys. Deleting the
-- person who set up a workspace's SSO keeps the provider (user_id set null);
-- deleting the workspace deletes its providers.
--
-- Constraint and index names match what drizzle-kit generates from
-- packages/database/schema.ts (twoFactor, passkey, ssoProvider), so a later
-- `drizzle-kit push` sees no drift.

BEGIN;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS "two_factor" (
  "id" text PRIMARY KEY NOT NULL,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "user_id" text NOT NULL,
  "verified" boolean DEFAULT true,
  "failed_verification_count" integer DEFAULT 0,
  "locked_until" timestamp
);

CREATE TABLE IF NOT EXISTS "passkey" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "public_key" text NOT NULL,
  "user_id" text NOT NULL,
  "credential_id" text NOT NULL,
  "counter" integer NOT NULL,
  "device_type" text NOT NULL,
  "backed_up" boolean NOT NULL,
  "transports" text,
  "created_at" timestamp,
  "aaguid" text
);

CREATE TABLE IF NOT EXISTS "sso_provider" (
  "id" text PRIMARY KEY NOT NULL,
  "issuer" text NOT NULL,
  "oidc_config" text,
  "saml_config" text,
  "user_id" text,
  "provider_id" text NOT NULL,
  "organization_id" text,
  "domain" text NOT NULL,
  "domain_verified" boolean DEFAULT false,
  CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);

DO $$ BEGIN
  ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "two_factor_secret_idx"
  ON "two_factor" USING btree ("secret");
CREATE INDEX IF NOT EXISTS "two_factor_user_id_idx"
  ON "two_factor" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "passkey_user_id_idx"
  ON "passkey" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "passkey_credential_id_idx"
  ON "passkey" USING btree ("credential_id");
CREATE INDEX IF NOT EXISTS "sso_provider_organization_id_idx"
  ON "sso_provider" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "sso_provider_domain_idx"
  ON "sso_provider" USING btree ("domain");

COMMIT;
