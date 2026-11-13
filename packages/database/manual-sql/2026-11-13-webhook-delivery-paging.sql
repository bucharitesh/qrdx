-- An index for the paged webhook deliveries list
-- (/dashboard/<workspace>/settings/webhooks/<id>).
--
-- The list pages an endpoint's deliveries with
--   WHERE endpoint_id = $1 [AND status = $2]
--   ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET n
-- (the id breaks ties, so a delivery never shows on two pages or none). A
-- busy endpoint keeps thousands of deliveries for 30 days; with this index a
-- page is read in order instead of sorting all of them each time. The
-- existing webhook_delivery_endpoint_id_idx stays (the retry worker and the
-- endpoint's delete cascade use it).
--
-- Additive and idempotent: one new index, IF NOT EXISTS, no table, column or
-- data changes, safe to run more than once. packages/database/schema.ts
-- declares the same index.
--
-- CREATE INDEX CONCURRENTLY can't run inside a transaction block: run the
-- statements one by one (psql without -1/--single-transaction), not inside
-- BEGIN/COMMIT. It builds without locking writes to webhook_delivery.
--
-- Order: any time. The code doesn't depend on it (pages only get cheaper),
-- so apply before or after the deploy.
--
-- Rollback: nothing to do; code from before this change works with or
-- without it.

-- ── 1. Dry run (read-only): the table and the indexes it has ───────────────
SELECT relname AS table, n_live_tup AS rows_estimate
FROM pg_stat_user_tables
WHERE relname = 'webhook_delivery';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'webhook_delivery'
ORDER BY indexname;

-- ── 2. Apply ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "webhook_delivery_endpoint_created_at_id_idx"
  ON "webhook_delivery" ("endpoint_id", "created_at" DESC, "id" DESC);

-- ── 3. Check: the index exists and is valid ─────────────────────────────────
-- A concurrent build that fails leaves an INVALID index; if valid is false,
-- run DROP INDEX CONCURRENTLY "webhook_delivery_endpoint_created_at_id_idx";
-- and step 2 again.
SELECT c.relname AS index, i.indisvalid AS valid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'webhook_delivery_endpoint_created_at_id_idx';
