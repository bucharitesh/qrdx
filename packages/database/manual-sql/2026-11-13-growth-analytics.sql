-- Growth analytics (apps/app/lib/analytics): how an account found QRdx,
-- where a code was made, and daily API, MCP and chat bot usage counts.
--
-- user_acquisition: one row per account created after this ships, written
-- once at sign-up (lib/analytics/acquisition.ts). How the visit the person
-- signed up in started: the referring site's host name (external referrers
-- only, never the full address), the link's utm_source, utm_medium and
-- utm_campaign, a QRdx `ref` tag, the first page of the visit and the page
-- the sign-in panel opened on, all sanitised on the server. `channel` is
-- worked out on the server from those (lib/analytics/channel.ts), never
-- taken from the browser. Nothing is stored on the visitor's device, and a
-- browser sending Do Not Track or Global Privacy Control sends nothing.
-- Deleted with the account (ON DELETE CASCADE). Older accounts have no row
-- ("unknown").
--
-- qr_code.created_via: where a code was made (dashboard, playground, api,
-- mcp, slack, import, page, duplicate, migrate). NULL for every code made
-- before this change.
--
-- usage_daily: counters per UTC day (lib/analytics/usage.ts). `key` is a
-- route group, tool or command name from a fixed list in the code ("qr:keyed",
-- "design_qr", "track"); never user data, content or ids.
--
-- Additive and idempotent: two new tables, one index and one nullable
-- column without a default (a metadata-only change, no table rewrite), safe
-- to run more than once, in one transaction. No existing column changes.
--
-- Order: apply it BEFORE deploying the code. packages/database/schema.ts
-- lists qr_code.created_via, so every query that selects whole qr_code rows
-- (and every code insert) needs the column to exist. The two tables are only
-- touched by their own writers, which skip the write (and warn once) while
-- the tables are missing.
--
-- Rollback: the code before this change never reads these. To remove them:
--   DROP TABLE IF EXISTS user_acquisition;
--   DROP TABLE IF EXISTS usage_daily;
--   ALTER TABLE qr_code DROP COLUMN IF EXISTS created_via;

BEGIN;

CREATE TABLE IF NOT EXISTS user_acquisition (
  user_id       text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  -- affiliate|plugin|mcp|bot|developer|ai_assistant|search|social|campaign|referral|direct
  channel       text NOT NULL,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  ref_tag       text,
  landing_path  text,
  signup_path   text,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_acquisition_channel_idx
  ON user_acquisition (channel);

-- dashboard|playground|api|mcp|slack|import|page|duplicate|migrate; NULL = made before this change
ALTER TABLE qr_code ADD COLUMN IF NOT EXISTS created_via text;

CREATE TABLE IF NOT EXISTS usage_daily (
  day     date    NOT NULL,
  -- api|mcp|slack|telegram|discord
  channel text    NOT NULL,
  -- request|tool_call|command|session|error
  metric  text    NOT NULL,
  key     text    NOT NULL DEFAULT '',
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, channel, metric, key)
);

COMMIT;
