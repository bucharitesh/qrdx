-- !! APPLY ONLY AFTER 0009 AND AFTER THE CODE THAT READS slug_scope IS LIVE
-- !! IN PRODUCTION AND EVERY PREVIEW THAT SHARES THIS DATABASE.
--
-- Contract step of custom back-halves (0009 was the expand step). Drops the
-- global uniqueness of qr_code.slug, so a back-half chosen on a custom domain
-- only has to be unique on that domain: (slug_scope, slug) and
-- (domain_id, slug) from 0009 take over.
--
-- Not backward-compatible with code from before 0009: that code inserts with
-- ON CONFLICT (slug), which fails once no unique constraint covers slug
-- alone. The new code inserts with a plain ON CONFLICT DO NOTHING and looks
-- slugs up by namespace, so it works before and after this file.
--
-- Until this runs, a back-half chosen on a custom domain is still refused when
-- any other QRdx code anywhere has the same slug (the app reports it as taken).
--
-- Idempotent. After applying, remove `.unique()` from qrCode.slug in
-- packages/database/schema.ts so drizzle-kit sees no drift.

ALTER TABLE "qr_code" DROP CONSTRAINT IF EXISTS "qr_code_slug_unique";
