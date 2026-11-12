import "server-only";

import {
  database as db,
  type UsageChannel,
  type UsageMetric,
  usageDaily,
} from "@repo/database";
import { sql } from "drizzle-orm";
import { after } from "next/server";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import { logError } from "@/lib/log-error";

// Daily usage counters for the developer channels (usage_daily): REST API
// requests, MCP tool calls and sessions, chat bot commands, and their
// errors, one row per UTC day, channel, metric and key. The key is a route
// group, tool or command name from a fixed list in the calling code
// ("qr:keyed", "design_qr", "track"); never user data, content or ids. Keys
// that don't look like one are counted as "other".
//
// One upsert per call, after the response, never throwing. Before
// packages/database/manual-sql/2026-11-13-growth-analytics.sql is applied
// the table doesn't exist: that's noted once and nothing is written.

/** A key as the calling code names it: lower-case words, digits and : _ . - */
const KEY = /^[a-z0-9][a-z0-9_:.-]{0,63}$/;

/** "2026-11-13": the UTC day a count belongs to. */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// The test suites fake `fetch`, which the database driver uses, so they
// count nothing unless a test asks (recordUsageInTests).
let countInTests = false;

/** Lets a test's calls be counted (against its fake database). */
export function recordUsageInTests(on = true): void {
  countInTests = on;
}

let warnedMissing = false;
let lastErrorAt = 0;
/** At most one logged failure a minute: a counter isn't worth a log flood. */
const ERROR_LOG_INTERVAL_MS = 60_000;

/** Adds one to today's count. Returns when written (or skipped); never throws. */
export async function addUsage(
  channel: UsageChannel,
  metric: UsageMetric,
  key = "",
  now: Date = new Date(),
): Promise<void> {
  const safeKey = key === "" || KEY.test(key) ? key : "other";
  try {
    await db
      .insert(usageDaily)
      .values({
        day: usageDay(now),
        channel,
        metric,
        key: safeKey,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [
          usageDaily.day,
          usageDaily.channel,
          usageDaily.metric,
          usageDaily.key,
        ],
        set: { count: sql`${usageDaily.count} + 1` },
      });
  } catch (error) {
    if (isMissingTableError(error)) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn(
          "Growth analytics: usage_daily doesn't exist yet (packages/database/manual-sql/2026-11-13-growth-analytics.sql). API, MCP and bot usage isn't counted until it does.",
        );
      }
      return;
    }
    const at = now.getTime();
    if (at - lastErrorAt >= ERROR_LOG_INTERVAL_MS) {
      lastErrorAt = at;
      logError(error as Error, { action: "analytics.record_usage", channel });
    }
  }
}

/**
 * Counts one request, tool call, command, session or error, after the
 * response so the caller never waits on it. Never throws.
 */
export function recordUsage(
  channel: UsageChannel,
  metric: UsageMetric,
  key = "",
): void {
  if (process.env.NODE_ENV === "test" && !countInTests) return;
  const now = new Date();
  const task = () => addUsage(channel, metric, key, now);
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): count now.
    void task();
  }
}

// ── REST API (app/api/v1) ────────────────────────────────────────────────────

/** The /v1 route groups counted, one per top-level path segment. */
export type ApiRouteGroup =
  | "barcode"
  | "barcodes"
  | "codes"
  | "community"
  | "conversions"
  | "hooks"
  | "me"
  | "qr"
  | "themes"
  | "unknown";

/**
 * "keyed" when the request carries a bearer credential (an API key or an
 * OAuth token), else "anon" (a public endpoint, or the browser session).
 */
export function apiCallerKind(req: Request): "keyed" | "anon" {
  const authorization = req.headers.get("authorization") ?? "";
  return /^bearer\s+\S/i.test(authorization) ? "keyed" : "anon";
}

/** Counts a /v1 request and, when it fails, its error class. Never throws. */
export function recordApiRequest(
  group: ApiRouteGroup,
  req: Request,
  status: number,
): void {
  recordUsage("api", "request", `${group}:${apiCallerKind(req)}`);
  if (status >= 400) {
    recordUsage("api", "error", `${group}:${status >= 500 ? "5xx" : "4xx"}`);
  }
}

/**
 * A /v1 route handler that counts its requests (recordApiRequest). GET
 * /v1/qr is served from the CDN once rendered, so its counts are distinct
 * renders, not requests.
 */
export function withApiUsage<R extends Request, A extends unknown[]>(
  group: ApiRouteGroup,
  handler: (req: R, ...rest: A) => Promise<Response> | Response,
): (req: R, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    let status = 500;
    try {
      const response = await handler(req, ...rest);
      status = response.status;
      return response;
    } finally {
      recordApiRequest(group, req, status);
    }
  };
}
