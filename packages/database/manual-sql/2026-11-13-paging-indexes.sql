-- Indexes for the paged admin lists and the affiliate commissions table.
--
-- Those lists page with ORDER BY <timestamp> DESC, id DESC LIMIT 25 OFFSET n
-- (the id breaks ties: codes made in one batch share created_at, and
-- without it a row could show on two pages or none). These indexes match
-- that order, so a page is read from the index instead of sorting the whole
-- table each time:
--
--   qr_code (created_at DESC, id DESC)             /admin/codes
--   qr_preset (created_at DESC, id DESC)           /admin/themes (saved)
--   subscription (created_at DESC, id DESC)        /admin/subscriptions
--   integration (created_at DESC, id DESC)         /admin/integrations
--   affiliate_commission (affiliate_id, order_paid_at DESC, id DESC)
--                                                  an affiliate's commissions,
--                                                  in /admin/affiliates/<id>
--                                                  and Settings → Affiliate
--                                                  program
--
-- "user" and admin_audit_log already have a created_at index, and
-- community_theme one on published_at; they're left as they are.
--
-- Additive and idempotent: five new indexes, IF NOT EXISTS, no table, column
-- or data changes, safe to run more than once. packages/database/schema.ts
-- declares the same indexes.
--
-- CREATE INDEX CONCURRENTLY can't run inside a transaction block: run the
-- statements one by one (psql without -1/--single-transaction), not inside
-- BEGIN/COMMIT. It builds each index without locking writes to its table.
--
-- Order: any time. The code doesn't depend on them (pages only get
-- cheaper), so apply before or after the deploy.
--
-- Rollback: nothing to do; code from before this change works with or
-- without them.

-- ── 1. Dry run (read-only): the tables and the indexes they have ───────────
SELECT relname AS table, n_live_tup AS rows_estimate
FROM pg_stat_user_tables
WHERE relname IN ('qr_code', 'qr_preset', 'subscription', 'integration',
                  'affiliate_commission')
ORDER BY relname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('qr_code', 'qr_preset', 'subscription', 'integration',
                    'affiliate_commission')
ORDER BY tablename, indexname;

-- ── 2. Apply, one statement at a time ───────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "qr_code_created_at_id_idx"
  ON "qr_code" USING btree ("created_at" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "qr_preset_created_at_id_idx"
  ON "qr_preset" USING btree ("created_at" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "subscription_created_at_id_idx"
  ON "subscription" USING btree ("created_at" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "integration_created_at_id_idx"
  ON "integration" USING btree ("created_at" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "affiliate_commission_affiliate_paid_idx"
  ON "affiliate_commission" USING btree ("affiliate_id", "order_paid_at" DESC, "id" DESC);

-- ── 3. Check: each index exists and is valid ────────────────────────────────
-- A concurrent build that fails leaves an INVALID index. If valid is false
-- for one, run DROP INDEX CONCURRENTLY "<that index>"; and its CREATE again.
SELECT c.relname AS index, i.indisvalid AS valid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('qr_code_created_at_id_idx',
                    'qr_preset_created_at_id_idx',
                    'subscription_created_at_id_idx',
                    'integration_created_at_id_idx',
                    'affiliate_commission_affiliate_paid_idx')
ORDER BY c.relname;
