// The audit log's filter (Settings → Audit log, its CSV export): who, which
// category, which UTC days. It lives in the URL's query. Pure and
// client-safe.

import { type AuditCategory, isAuditCategory } from "./catalogue";

export interface AuditFilter {
  /** actor_user_id: a person, with their API keys and apps */
  actor: string | null;
  category: AuditCategory | null;
  /** First day, YYYY-MM-DD (UTC), inclusive */
  from: string | null;
  /** Last day, YYYY-MM-DD (UTC), inclusive */
  to: string | null;
}

export const EMPTY_AUDIT_FILTER: AuditFilter = {
  actor: null,
  category: null,
  from: null,
  to: null,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w-]{1,128}$/;
const KEYS = ["actor", "category", "from", "to"] as const;

/** Midnight UTC of a YYYY-MM-DD day; null for anything else. */
export function dayStart(day: string | null): Date | null {
  if (!(day && DAY.test(day))) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day
    ? null
    : date;
}

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || null;

/** The filter in a URL's query (unknown or malformed values are dropped). */
export function parseAuditFilter(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): AuditFilter {
  const get = (key: string) =>
    params instanceof URLSearchParams
      ? params.get(key)?.trim() || null
      : first(params[key]);
  const actor = get("actor");
  const category = get("category");
  const from = get("from");
  const to = get("to");
  return {
    actor: actor && ID.test(actor) ? actor : null,
    category: isAuditCategory(category) ? category : null,
    from: dayStart(from) ? from : null,
    to: dayStart(to) ? to : null,
  };
}

/** The filter as a query string without "?" (empty values left out). */
export function auditFilterQuery(filter: AuditFilter): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = filter[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

export const isFiltered = (filter: AuditFilter) =>
  KEYS.some((key) => Boolean(filter[key]));
