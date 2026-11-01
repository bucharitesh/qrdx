-- Custom back-halves (qrdx.dev/q/spring-menu, go.brand.com/spring-menu):
-- every slug gets a namespace, so a back-half chosen on a customer's custom
-- domain only has to be unique on that domain.
--
--   slug_scope = ''            shared namespace: generated slugs and back-halves
--                              chosen on the default link (qrdx.dev/q/<slug>)
--   slug_scope = <domain id>   a back-half chosen on that custom domain
--                              (only https://<domain>/<slug>)
--
-- Additive and idempotent: safe to run more than once, in one transaction.
-- Every existing row gets slug_scope = '' (the default), which is what the
-- deployed code means: it only ever creates generated (shared) slugs. The
-- deployed code never selects or inserts slug_scope, and slugs are still
-- globally unique (qr_code_slug_unique stays), so both new indexes hold for
-- every existing row and every row the deployed code can write, and its
-- ON CONFLICT (slug) keeps its arbiter.
--
-- Index names match what drizzle-kit generates from packages/database/schema.ts.
-- ADD COLUMN with a constant default is metadata-only (no table rewrite).
-- The two CREATE UNIQUE INDEX statements lock qr_code writes while they build;
-- if the table is large, run them one at a time with CONCURRENTLY outside a
-- transaction instead (drop BEGIN/COMMIT).
--
-- 0010 (dropping the global qr_code_slug_unique) comes only after the code
-- that reads slug_scope is live everywhere.

BEGIN;

ALTER TABLE "qr_code" ADD COLUMN IF NOT EXISTS "slug_scope" text DEFAULT '' NOT NULL;

-- A namespace holds each slug once (/q/<slug> on the shared host).
CREATE UNIQUE INDEX IF NOT EXISTS "qr_code_slug_scope_slug_unique" ON "qr_code" USING btree ("slug_scope","slug");

-- A custom domain serves each slug once (https://<domain>/<slug>).
CREATE UNIQUE INDEX IF NOT EXISTS "qr_code_domain_id_slug_unique" ON "qr_code" USING btree ("domain_id","slug");

COMMIT;
