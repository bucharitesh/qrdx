-- Saved UTM templates: one new table, utm_template.
-- A template is a named set of UTM parameters a workspace reuses from the
-- code builder's UTM panel, instead of retyping utm_source, utm_medium and
-- utm_campaign for every code.
--
-- Written by the dashboard-gaps agent (2026-11-04). Read by the UTM panel's
-- templates (apps/docs/lib/utm-templates.ts, feat/code-features), which
-- stay hidden until this is applied: the missing table counts as "off".
--
-- Additive and idempotent: safe to run more than once, in one transaction. It
-- creates a new table and its indexes and changes no existing table or
-- column.
--
-- `utm` holds the same shape as qr_code.utm, validated by the app with
-- utmConfigSchema (apps/docs/lib/redirect/routing.ts) on read and write.
-- Scope: the workspace (organization_id, required: every row belongs to
-- one, as with the app's other workspace data since workspaces shipped).
-- user_id is the creator. Deleting the creator or the workspace deletes
-- their templates. (Changed from a nullable organization_id on 2026-11-05,
-- before this file was applied, by the code-features agent.)
--
-- Constraint and index names match what drizzle-kit generates from this
-- definition, now `utmTemplate` in packages/database/schema.ts:
--
--   export const utmTemplate = pgTable(
--     "utm_template",
--     {
--       id: text("id").primaryKey(),
--       userId: text("user_id")
--         .notNull()
--         .references(() => user.id, { onDelete: "cascade" }),
--       organizationId: text("organization_id")
--         .notNull()
--         .references(() => organization.id, { onDelete: "cascade" }),
--       name: text("name").notNull(),
--       utm: json("utm").$type<unknown>().notNull(),
--       createdAt: timestamp("created_at").notNull(),
--       updatedAt: timestamp("updated_at").notNull(),
--     },
--     (table) => [
--       index("utm_template_user_id_idx").on(table.userId),
--       index("utm_template_organization_id_idx").on(table.organizationId),
--     ]
--   );

BEGIN;

CREATE TABLE IF NOT EXISTS "utm_template" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "utm" json NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "utm_template" ADD CONSTRAINT "utm_template_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "utm_template" ADD CONSTRAINT "utm_template_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "utm_template_user_id_idx"
  ON "utm_template" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "utm_template_organization_id_idx"
  ON "utm_template" USING btree ("organization_id");

COMMIT;
