import "server-only";

import { communityItem, database as db } from "@repo/database";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { logError } from "@/lib/log-error";

// Full-text search over community items (manual-sql/0017_community_search
// .sql): a GIN expression index on the 'simple' tsvector of each item's name
// and description. Until that index exists and is valid, searches keep using
// the in-memory search (lib/community/api.ts), so production never breaks
// before the SQL is applied.

export const SEARCH_INDEX = "community_item_search_idx";

/** The indexed document; must stay exactly the expression in 0017. */
export const SEARCH_DOCUMENT = sql`to_tsvector('simple'::regconfig, coalesce(${communityItem.name}, '') || ' ' || coalesce(${communityItem.description}, ''))`;

const MAX_WORDS = 8;

/** The words of a search, lowercased, without accents or punctuation. */
export function searchWords(query: string): string[] {
  return query
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

/**
 * A tsquery that matches every word as a prefix ("wi:* & fi:*"), or null
 * when there are no words. Only letters and digits get through, so the
 * text can't change the query's syntax.
 */
export function toPrefixQuery(query: string): string | null {
  const words = searchWords(query);
  return words.length > 0 ? words.map((word) => `${word}:*`).join(" & ") : null;
}

async function indexIsValid(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`select i.indisvalid as valid from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = ${SEARCH_INDEX}`,
    );
    const rows = (result as { rows?: { valid?: unknown }[] }).rows ?? [];
    return rows[0]?.valid === true;
  } catch (error) {
    logError(error as Error, { action: "community search index check" });
    return false;
  }
}

/** Whether 0017's index exists and is valid (checked every 5 minutes). */
export const fullTextSearchAvailable = unstable_cache(
  indexIsValid,
  ["community-search-index"],
  { revalidate: 300 },
);
