-- The QRdx bot for Slack (apps/docs/lib/slack-bot): two new tables.
--
-- slack_bot_installation: one row per Slack workspace the bot was added to
-- (Settings → Integrations → Slack → Add the bot to Slack). It keeps the
-- workspace's id and name, the bot's Slack user id, the bot token encrypted
-- with INTEGRATION_ENCRYPTION_KEY, the scopes Slack granted, and which QRdx
-- user added it (set to null if that account is deleted). Removing the app
-- in Slack deletes the row (the app_uninstalled and tokens_revoked events).
--
-- slack_user_link: a Slack person who linked their QRdx account (/qr link),
-- so their /qr track commands create dynamic codes as that QRdx user in the
-- workspace they picked. One per Slack user per Slack workspace; linking
-- again replaces it. Deleted with the QRdx account or workspace (ON DELETE
-- cascade), by /qr unlink, from Settings, and when the app is removed from
-- the Slack workspace.
--
-- No message text is stored anywhere.
--
-- Additive and idempotent: new tables, their foreign keys and indexes only,
-- safe to run more than once, in one transaction. No existing table or
-- column changes.
--
-- Order: apply it BEFORE setting SLACK_SIGNING_SECRET in production. The
-- code only touches these tables while the bot is configured (the Slack app
-- keys and SLACK_SIGNING_SECRET are all set). If the code runs with the bot
-- configured before this is applied, /qr still answers with QR code images
-- (they need no database), while adding the bot, /qr link and /qr track say
-- they aren't available yet; nothing else in the app reads these tables.
--
-- Rollback: the code before this feature never reads or writes these
-- tables, so it keeps working with them present. Leave them in place when
-- rolling back; dropping them is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   SELECT count(*) FROM slack_bot_installation;  -- 0 right after
--   SELECT count(*) FROM slack_user_link;         -- 0 right after
--   \d slack_bot_installation
--   \d slack_user_link
--
-- Names match what drizzle-kit generates from packages/database/schema.ts
-- (slackBotInstallation, slackUserLink), so a later `drizzle-kit push` sees
-- no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "slack_bot_installation" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "enterprise_id" text,
  "team_name" text,
  "bot_user_id" text NOT NULL,
  "bot_token" text NOT NULL,
  "scopes" text,
  "installed_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "slack_bot_installation"
    ADD CONSTRAINT "slack_bot_installation_installed_by_user_id_user_id_fk"
    FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."user"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One install per Slack workspace. Outside Enterprise Grid there is no
-- enterprise id; it counts as '' so the same workspace can't appear twice.
CREATE UNIQUE INDEX IF NOT EXISTS "slack_bot_installation_team_unique"
  ON "slack_bot_installation" USING btree ("team_id", coalesce("enterprise_id", ''));

CREATE INDEX IF NOT EXISTS "slack_bot_installation_installed_by_idx"
  ON "slack_bot_installation" USING btree ("installed_by_user_id");

CREATE TABLE IF NOT EXISTS "slack_user_link" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "slack_user_id" text NOT NULL,
  "user_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "slack_user_link"
    ADD CONSTRAINT "slack_user_link_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "slack_user_link"
    ADD CONSTRAINT "slack_user_link_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "slack_user_link_team_slack_user_unique"
  ON "slack_user_link" USING btree ("team_id", "slack_user_id");

CREATE INDEX IF NOT EXISTS "slack_user_link_user_id_idx"
  ON "slack_user_link" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "slack_user_link_organization_id_idx"
  ON "slack_user_link" USING btree ("organization_id");

COMMIT;
