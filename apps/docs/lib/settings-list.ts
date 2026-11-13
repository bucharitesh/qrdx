import "server-only";

import { user as userTable } from "@repo/database/schema";
import { type SQL, sql } from "drizzle-orm";

/** The user.settings lists the app appends to (packages/database/schema.ts). */
export type SettingsListKey = "whatsNewDismissed" | "spotlightsSeen";

/**
 * user.settings with `values` added to the end of its string list `key`
 * (moved there when already in it) and only the last `limit` kept: one
 * expression for an UPDATE's SET, so writes from two tabs merge instead of
 * one overwriting the other, and other settings stay as they are. Mirrors
 * appendRecent (lib/changelog-feed.ts). Anything in the list that isn't a
 * string is dropped; a value that isn't a list counts as empty.
 */
export function settingsWithAppended(
  key: SettingsListKey,
  values: readonly string[],
  limit: number,
): SQL {
  // Anything but an object (SQL or JSON null) starts from an empty one.
  const settings = sql`(case when jsonb_typeof(${userTable.settings}::jsonb) = 'object' then ${userTable.settings}::jsonb else '{}'::jsonb end)`;
  const added = JSON.stringify(values);
  return sql`(${settings} || jsonb_build_object(${key}::text, (
    select coalesce(jsonb_agg(kept.value order by kept.position), '[]'::jsonb)
    from (
      select merged.value, merged.position
      from (
        select prev.value, prev.position
        from jsonb_array_elements(
          case when jsonb_typeof(${settings} -> ${key}::text) = 'array'
            then ${settings} -> ${key}::text
            else '[]'::jsonb
          end
        ) with ordinality as prev(value, position)
        where jsonb_typeof(prev.value) = 'string'
          and not (${added}::jsonb @> jsonb_build_array(prev.value))
        union all
        select fresh.value, fresh.position + 1000000
        from jsonb_array_elements(${added}::jsonb) with ordinality as fresh(value, position)
      ) merged
      order by merged.position desc
      limit ${limit}
    ) kept
  )))::json`;
}
