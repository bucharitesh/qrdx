-- Community: an index for remix lineage, which looks copies up by the saved
-- theme or page they made (community_use.preset_id; lib/community/remix.ts).
--
-- Additive and idempotent: it only creates one index, IF NOT EXISTS, and
-- changes no table or data. The code doesn't depend on it (lookups only get
-- faster), so it can be applied before or after the deploy.
--
-- CREATE INDEX CONCURRENTLY can't run inside a transaction block: run the
-- statements one by one (psql without -1/--single-transaction), not inside
-- BEGIN/COMMIT. It doesn't lock writes to community_use while it builds.

-- ── 1. Dry run (read-only): what the index will cover ──────────────────────
SELECT count(*) AS rows_total,
       count(*) FILTER (WHERE preset_id IS NOT NULL) AS rows_with_preset_id
FROM community_use;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'community_use'
ORDER BY indexname;

-- ── 2. Apply ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "community_use_preset_id_idx"
  ON "community_use" ("preset_id")
  WHERE "preset_id" IS NOT NULL;

-- ── 3. Check: the index exists and is valid ─────────────────────────────────
-- A concurrent build that fails leaves an INVALID index; if indisvalid is
-- false, run DROP INDEX CONCURRENTLY "community_use_preset_id_idx"; and step 2
-- again.
SELECT c.relname AS index, i.indisvalid AS valid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'community_use_preset_id_idx';
