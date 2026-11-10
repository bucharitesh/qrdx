-- New hosted page types (apps/docs/lib/landing): one nullable column and
-- one partial index on landing_page.
--
-- landing_page.gtin: a product page's GTIN (14 digits, check digit
-- verified by the app), copied from the page's product block when the
-- page is published. On a verified custom domain,
-- https://<domain>/01/<GTIN>[/10/<lot>][/21/<serial>] (GS1 Digital Link)
-- opens the page through its code on that domain and counts a scan. The
-- shared qrdx.dev host never resolves GTINs. The app keeps a GTIN to one
-- product page per custom domain when a page is published. Null for every
-- other page, and for every existing row.
--
-- landing_page_gtin_idx: partial index for that lookup (rows with a GTIN
-- only, so it starts empty).
--
-- Additive and idempotent: a nullable column with no default and a new
-- index, safe to run more than once, in one transaction. No existing
-- column, row or constraint changes. The index is small (no row has a
-- GTIN yet), so a plain CREATE INDEX holds its lock only briefly.
--
-- Order: apply it BEFORE deploying the code. Publishing a page that has a
-- product block writes this column; every other page and every page view
-- works without it.
--
-- Rollback: the code before this change never reads or writes the column,
-- so it keeps working with it present. Leave it in place when rolling
-- back; dropping it is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   \d landing_page                                         -- gtin text
--   SELECT count(*) FROM landing_page WHERE gtin IS NOT NULL; -- 0 right after

BEGIN;

ALTER TABLE landing_page ADD COLUMN IF NOT EXISTS gtin text;

CREATE INDEX IF NOT EXISTS landing_page_gtin_idx
  ON landing_page (gtin)
  WHERE gtin IS NOT NULL;

COMMIT;
