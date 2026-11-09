-- Workspace audit log (Business, apps/docs/ee/audit-log): one new table,
-- workspace_audit_log, with who changed what in a workspace and when. Owners
-- and admins read it in Settings → Audit log and export it as CSV. It is
-- separate from the staff-only admin_audit_log.
--
-- Each row: the workspace (organization_id), the actor (a person, an API
-- key, an OAuth app or the system) with a snapshot of their name, the
-- action id, the target with a snapshot of its name, a small before/after in
-- metadata (never secrets: no key values, tokens, passwords or webhook
-- secrets), and the request's IP address and device ("Chrome on macOS").
--
-- No foreign keys on purpose: rows stay readable after the actor, the
-- target or the API key is deleted. The app deletes a workspace's rows when
-- the workspace is deleted, and the daily cron (/api/cron/webhooks) deletes
-- rows older than 365 days in batches, plus rows whose workspace no longer
-- exists.
--
-- Additive and idempotent: a new table and its indexes only, safe to run more
-- than once, in one transaction. No existing table or column changes.
--
-- Order: apply it BEFORE deploying the code that writes it. If the code runs
-- first, every write fails on the missing table; the app catches and logs
-- that (once per process) and the change the person made still goes through,
-- so nothing breaks, but nothing is recorded and Settings → Audit log says
-- the log isn't available yet.
--
-- Rollback: the code before this feature never reads or writes this table,
-- so it keeps working with the table present. Leave the table in place when
-- rolling back; dropping it is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   SELECT count(*) FROM workspace_audit_log;  -- 0 right after
--   \d workspace_audit_log
--
-- Names match what drizzle-kit generates from packages/database/schema.ts
-- (workspaceAuditLog), so a later `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "workspace_audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_user_id" text,
  "actor_label" text,
  "api_key_id" text,
  "oauth_app_id" text,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "target_label" text,
  "metadata" jsonb,
  "ip" text,
  "device" text,
  "created_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "workspace_audit_log_org_created_at_idx"
  ON "workspace_audit_log" USING btree ("organization_id", "created_at" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "workspace_audit_log_org_action_idx"
  ON "workspace_audit_log" USING btree ("organization_id", "action");

CREATE INDEX IF NOT EXISTS "workspace_audit_log_org_actor_idx"
  ON "workspace_audit_log" USING btree ("organization_id", "actor_user_id");

-- The daily purge of rows older than 365 days, across workspaces.
CREATE INDEX IF NOT EXISTS "workspace_audit_log_created_at_idx"
  ON "workspace_audit_log" USING btree ("created_at");

COMMIT;
