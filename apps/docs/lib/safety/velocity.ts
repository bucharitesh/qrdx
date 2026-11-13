import "server-only";

import { hasAdminRole } from "@repo/auth/admin";
import { NEW_PAID_ACCOUNT_CODES_PER_HOUR } from "@repo/config";
import { abuseReport, database as db, qrCode, user } from "@repo/database";
import cuid from "cuid";
import { and, asc, count, eq, gte } from "drizzle-orm";
import { after } from "next/server";
import { cache } from "react";
import { HttpError } from "@/lib/error-response";
import { formatCount } from "@/lib/format-count";

/**
 * Abuse defences for young accounts, where most phishing comes from: a cap on
 * how many dynamic codes they create per hour, and suspicious destinations
 * (see lib/safety/url-heuristics.ts) held for an admin's review instead of
 * going live (/admin/abuse).
 */

export const NEW_ACCOUNT_DAYS = 7;
export const NEW_ACCOUNT_CODES_PER_HOUR = 30;
/** In a paid workspace (@repo/config limits.ts). */
export { NEW_PAID_ACCOUNT_CODES_PER_HOUR };

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** True while an account created at `createdAt` counts as new. */
export function isNewAccount(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() < NEW_ACCOUNT_DAYS * DAY_MS;
}

/** Whether the user's account is still new (admins never are). Deduped per request. */
export const getAccountStanding = cache(
  async (userId: string): Promise<{ isNew: boolean }> => {
    const [row] = await db
      .select({ createdAt: user.createdAt, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!row) return { isNew: true };
    return { isNew: !hasAdminRole(row.role) && isNewAccount(row.createdAt) };
  },
);

/**
 * Throws 429 when a new account would create more than
 * NEW_ACCOUNT_CODES_PER_HOUR codes within a rolling hour (all workspaces);
 * NEW_PAID_ACCOUNT_CODES_PER_HOUR when the codes go to a paid workspace.
 */
export async function enforceNewAccountVelocity(
  userId: string,
  adding: number,
  { paid = false }: { paid?: boolean } = {},
): Promise<void> {
  if (!(await getAccountStanding(userId)).isNew) return;
  const cap = paid
    ? NEW_PAID_ACCOUNT_CODES_PER_HOUR
    : NEW_ACCOUNT_CODES_PER_HOUR;

  const now = Date.now();
  const since = new Date(now - HOUR_MS);
  const recent = and(eq(qrCode.userId, userId), gte(qrCode.createdAt, since));
  const [row] = await db.select({ total: count() }).from(qrCode).where(recent);
  const total = row?.total ?? 0;
  if (total + adding <= cap) return;

  // Room comes back as codes leave the rolling hour: wait until enough of
  // the oldest have left for this request to fit (an hour when it never can).
  const mustLeave = total + adding - cap;
  let freedAt = now + HOUR_MS;
  if (adding <= cap) {
    const [nth] = await db
      .select({ createdAt: qrCode.createdAt })
      .from(qrCode)
      .where(recent)
      .orderBy(asc(qrCode.createdAt))
      .limit(1)
      .offset(mustLeave - 1);
    if (nth) freedAt = new Date(nth.createdAt).getTime() + HOUR_MS;
  }
  const retryAfterSeconds = Math.max(60, Math.ceil((freedAt - now) / 1000));
  const minutes = Math.ceil(retryAfterSeconds / 60);
  throw new HttpError(
    429,
    "RATE_LIMITED",
    adding > cap
      ? `During their first ${NEW_ACCOUNT_DAYS} days, accounts can create up to ${formatCount(cap)} dynamic codes per hour, so send at most ${formatCount(cap)} at a time.`
      : `During their first ${NEW_ACCOUNT_DAYS} days, accounts can create up to ${formatCount(cap)} dynamic codes per hour. You can create ${adding === 1 ? "the next one" : `these ${formatCount(adding)}`} in ${minutes === 1 ? "a minute" : `${minutes} minutes`}.`,
    { "Retry-After": String(retryAfterSeconds) },
  );
}

export interface HoldRequest {
  qrCodeId: string;
  /** The URL that triggered the hold */
  url: string;
  /** Which setting it is, e.g. "destination" or "fallback URL" */
  field: string;
  reasons: string[];
}

/**
 * Files an open "auto-hold" report per held code once the response has been
 * sent (new codes exist by then). Failures are logged, never thrown.
 */
export function fileHoldReports(holds: HoldRequest[]): void {
  if (holds.length === 0) return;
  const createdAt = new Date();
  const task = () =>
    db
      .insert(abuseReport)
      .values(
        holds.map((hold) => ({
          id: cuid(),
          qrCodeId: hold.qrCodeId,
          url: hold.url.slice(0, 2048),
          reason: "auto-hold",
          details: `New account; ${hold.field} flagged: ${hold.reasons.join("; ")}`,
          status: "open",
          createdAt,
        })),
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        console.error("[safety] Failed to file hold report:", error);
      });
  try {
    after(task);
  } catch {
    // Outside a request (scripts): nothing waits for a response.
    void task();
  }
}
