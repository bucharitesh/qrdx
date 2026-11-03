-- Community, phase 1: creator profiles, items (frames, themes, collections)
-- with immutable versions, tags, likes, saves, uses and collection entries.
--
-- Additive and idempotent: safe to run more than once, in one transaction.
-- It only creates new tables and their indexes. No existing table or column
-- changes, so the code deployed today keeps working, and community_theme,
-- community_theme_tag and theme_like stay as they are (retiring them is a
-- separate, later change).
--
-- Order (see packages/database/scripts/backfill-community.mjs):
--   1. this file;
--   2. the backfill (dry run, then --apply --backup), which copies the
--      published themes into community_item;
--   3. deploy the code that reads these tables;
--   4. the backfill again (themes published in between), then the seed
--      (packages/database/scripts/seed-community.mjs).
-- If the code goes out before this file, it fails safe: the gallery keeps
-- reading community_theme, frames come from the engine's official catalogue,
-- and publishing frames or claiming a handle says it isn't available yet.
--
-- Constraint and index names match what drizzle-kit generates from
-- packages/database/schema.ts, so a later `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "community_profile" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text DEFAULT 'person' NOT NULL,
  "user_id" text,
  "workspace_id" text,
  "handle" text,
  "display_name" text NOT NULL,
  "bio" text,
  "avatar_url" text,
  "verified_at" timestamp,
  "status" text DEFAULT 'active' NOT NULL,
  "handle_changed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "community_item" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "slug" text NOT NULL,
  "profile_id" text NOT NULL,
  "created_by" text,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'published' NOT NULL,
  "license" text DEFAULT 'CC0-1.0' NOT NULL,
  "current_version" integer DEFAULT 1 NOT NULL,
  "payload" json NOT NULL,
  "payload_hash" text NOT NULL,
  "facets" json,
  "scan_score" integer,
  "scan_checked_at" timestamp,
  "is_official" boolean DEFAULT false NOT NULL,
  "featured_at" timestamp,
  "remixed_from_item_id" text,
  "remixed_from_version" integer,
  "remixed_from_label" text,
  "source_kind" text,
  "source_id" text,
  "like_count" integer DEFAULT 0 NOT NULL,
  "save_count" integer DEFAULT 0 NOT NULL,
  "use_count" integer DEFAULT 0 NOT NULL,
  "remix_count" integer DEFAULT 0 NOT NULL,
  "legacy_community_theme_id" text,
  "published_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "removed_at" timestamp,
  "removed_reason" text,
  CONSTRAINT "community_item_legacy_community_theme_id_unique" UNIQUE("legacy_community_theme_id")
);

CREATE TABLE IF NOT EXISTS "community_item_version" (
  "id" text PRIMARY KEY NOT NULL,
  "item_id" text NOT NULL,
  "version" integer NOT NULL,
  "payload" json NOT NULL,
  "payload_hash" text NOT NULL,
  "changelog" text,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "community_item_tag" (
  "item_id" text NOT NULL,
  "tag" text NOT NULL,
  CONSTRAINT "community_item_tag_item_id_tag_pk" PRIMARY KEY("item_id","tag")
);

CREATE TABLE IF NOT EXISTS "community_like" (
  "user_id" text NOT NULL,
  "item_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "community_like_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);

CREATE TABLE IF NOT EXISTS "community_save" (
  "user_id" text NOT NULL,
  "item_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "community_save_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);

CREATE TABLE IF NOT EXISTS "community_use" (
  "id" text PRIMARY KEY NOT NULL,
  "item_id" text NOT NULL,
  "version" integer NOT NULL,
  "user_id" text,
  "kind" text NOT NULL,
  "workspace_id" text,
  "preset_id" text,
  "day" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "community_collection_entry" (
  "collection_id" text NOT NULL,
  "item_id" text NOT NULL,
  "position" integer NOT NULL,
  CONSTRAINT "community_collection_entry_collection_id_item_id_pk" PRIMARY KEY("collection_id","item_id")
);

-- Foreign keys (added separately so a re-run skips the ones that exist)

DO $$ BEGIN
  ALTER TABLE "community_profile" ADD CONSTRAINT "community_profile_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_profile" ADD CONSTRAINT "community_profile_workspace_id_organization_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_item" ADD CONSTRAINT "community_item_profile_id_community_profile_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "public"."community_profile"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_item" ADD CONSTRAINT "community_item_remixed_from_item_id_community_item_id_fk"
    FOREIGN KEY ("remixed_from_item_id") REFERENCES "public"."community_item"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_item_version" ADD CONSTRAINT "community_item_version_item_id_community_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_item_tag" ADD CONSTRAINT "community_item_tag_item_id_community_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_like" ADD CONSTRAINT "community_like_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_like" ADD CONSTRAINT "community_like_item_id_community_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_save" ADD CONSTRAINT "community_save_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_save" ADD CONSTRAINT "community_save_item_id_community_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_use" ADD CONSTRAINT "community_use_item_id_community_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_use" ADD CONSTRAINT "community_use_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_collection_entry" ADD CONSTRAINT "community_collection_entry_collection_id_community_item_id_fk"
    FOREIGN KEY ("collection_id") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "community_collection_entry" ADD CONSTRAINT "community_collection_entry_item_id_community_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes

CREATE UNIQUE INDEX IF NOT EXISTS "community_profile_handle_unique" ON "community_profile" USING btree ("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "community_profile_person_user_unique" ON "community_profile" USING btree ("user_id") WHERE kind = 'person';
CREATE UNIQUE INDEX IF NOT EXISTS "community_item_type_slug_unique" ON "community_item" USING btree ("type","slug");
CREATE INDEX IF NOT EXISTS "community_item_type_status_published_idx" ON "community_item" USING btree ("type","status","published_at");
CREATE INDEX IF NOT EXISTS "community_item_type_status_likes_idx" ON "community_item" USING btree ("type","status","like_count");
CREATE INDEX IF NOT EXISTS "community_item_profile_id_idx" ON "community_item" USING btree ("profile_id");
CREATE INDEX IF NOT EXISTS "community_item_payload_hash_idx" ON "community_item" USING btree ("payload_hash");
CREATE INDEX IF NOT EXISTS "community_item_source_idx" ON "community_item" USING btree ("source_kind","source_id");
CREATE UNIQUE INDEX IF NOT EXISTS "community_item_version_item_version_unique" ON "community_item_version" USING btree ("item_id","version");
CREATE INDEX IF NOT EXISTS "community_item_tag_tag_idx" ON "community_item_tag" USING btree ("tag");
CREATE INDEX IF NOT EXISTS "community_like_item_id_idx" ON "community_like" USING btree ("item_id");
CREATE INDEX IF NOT EXISTS "community_save_item_id_idx" ON "community_save" USING btree ("item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "community_use_once_a_day_unique" ON "community_use" USING btree ("item_id","user_id","kind","day");
CREATE INDEX IF NOT EXISTS "community_use_item_id_idx" ON "community_use" USING btree ("item_id");
CREATE INDEX IF NOT EXISTS "community_collection_entry_position_idx" ON "community_collection_entry" USING btree ("collection_id","position");

COMMIT;
