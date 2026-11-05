-- Community: Postgres full-text search over community items' names and
-- descriptions (lib/community/search.ts; GET /v1/community/items?q= and the
-- MCP search_community tool).
--
-- Additive and idempotent: one GIN expression index, CONCURRENTLY and
-- IF NOT EXISTS. No table, column or data changes (an expression index needs
-- no new column, so the table isn't rewritten or locked for writes). Safe to
-- run twice. The code checks for this index (pg_indexes) and keeps using its
-- in-memory search until it's there and valid, so it can be applied before
-- or after the deploy.
--
-- The expression must stay exactly the one lib/community/search.ts queries
-- (SEARCH_DOCUMENT), or Postgres won't use the index.
--
-- CREATE INDEX CONCURRENTLY can't run inside a transaction block: run the
-- statements one by one (psql without -1/--single-transaction).

-- ── 1. Dry run (read-only) ──────────────────────────────────────────────────
-- What will be indexed:
SELECT count(*) AS items,
       count(*) FILTER (WHERE status = 'published') AS published
FROM community_item;

-- How a few documents tokenize with the 'simple' configuration:
SELECT id, type,
       to_tsvector('simple'::regconfig,
                   coalesce(name, '') || ' ' || coalesce(description, '')) AS document
FROM community_item
WHERE status = 'published'
ORDER BY published_at DESC
LIMIT 5;

-- A sample query, as the app runs it (prefix match on every word):
SELECT id, slug, name
FROM community_item
WHERE status = 'published'
  AND to_tsvector('simple'::regconfig,
                  coalesce(name, '') || ' ' || coalesce(description, ''))
      @@ to_tsquery('simple'::regconfig, 'wi:* & fi:*')
LIMIT 10;

-- Whether the index is there already:
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'community_item'
  AND indexname = 'community_item_search_idx';

-- ── 2. Apply ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "community_item_search_idx"
  ON "community_item"
  USING gin (
    to_tsvector('simple'::regconfig,
                coalesce("name", '') || ' ' || coalesce("description", ''))
  );

-- ── 3. Check: the index exists and is valid ─────────────────────────────────
-- A concurrent build that fails leaves an INVALID index (the app then keeps
-- its in-memory search). If valid is false, run
-- DROP INDEX CONCURRENTLY "community_item_search_idx"; and step 2 again.
SELECT c.relname AS index, i.indisvalid AS valid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'community_item_search_idx';
