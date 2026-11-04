-- Saved UTM templates (the Dub study's gap 10): one new table, utm_template.
-- A template is a named set of UTM parameters a workspace reuses from the
-- code builder's UTM panel, instead of retyping utm_source, utm_medium and
-- utm_campaign for every code.
--
-- NOT USED BY ANY CODE YET. Written by the dashboard-gaps agent (2026-11-04),
-- which stopped here as its brief says for schema changes. Apply it before
-- deploying the code that reads it; nothing deployed today reads it.
--
-- Additive and idempotent: safe to run more than once, in one transaction. It
-- creates a new table and its indexes and changes no existing table or
-- column.
--
-- `utm` holds the same shape as qr_code.utm, validated by the app with
-- utmConfigSchema (apps/docs/lib/redirect/routing.ts) on read and write.
-- Scope follows qr_preset: the creator, plus the team when it belongs to
-- one (null = the creator's personal scope). Deleting the creator or the
-- team deletes their templates.
--
-- Constraint and index names match what drizzle-kit generates from this
-- definition, to add to packages/database/schema.ts with the feature:
--
--   export const utmTemplate = pgTable(
--     "utm_template",
--     {
--       id: text("id").primaryKey(),
--       userId: text("user_id")
--         .notNull()
--         .references(() => user.id, { onDelete: "cascade" }),
--       organizationId: text("organization_id").references(
--         () => organization.id,
--         { onDelete: "cascade" }
--       ),
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
  "organization_id" text,
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
