import "server-only";

import { hasAdminRole } from "@repo/auth/admin";
import { abuseReport, database as db, qrCode, user } from "@repo/database";
import cuid from "cuid";
import { and, count, eq, gte, min } from "drizzle-orm";
import { after } from "next/server";
import { cache } from "react";
import { HttpError } from "@/lib/error-response";

/**
 * Abuse defences for young accounts, where most phishing comes from: a cap on
 * how many dynamic codes they create per hour, and suspicious destinations
 * (see lib/safety/url-heuristics.ts) held for an admin's review instead of
 * going live (/admin/abuse).
 */

export const NEW_ACCOUNT_DAYS = 7;
export const NEW_ACCOUNT_CODES_PER_HOUR = 30;

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
 * NEW_ACCOUNT_CODES_PER_HOUR codes within a rolling hour (all workspaces).
 */
export async function enforceNewAccountVelocity(
  userId: string,
  adding: number,
): Promise<void> {
  if (!(await getAccountStanding(userId)).isNew) return;

  const now = Date.now();
  const [row] = await db
    .select({ total: count(), oldest: min(qrCode.createdAt) })
    .from(qrCode)
    .where(
      and(
        eq(qrCode.userId, userId),
        gte(qrCode.createdAt, new Date(now - HOUR_MS)),
      ),
    );
  if ((row?.total ?? 0) + adding <= NEW_ACCOUNT_CODES_PER_HOUR) return;

  const oldest = row?.oldest ? new Date(row.oldest).getTime() : now;
  const retryAfterSeconds = Math.max(
    60,
    Math.ceil((oldest + HOUR_MS - now) / 1000),
  );
  throw new HttpError(
    429,
    "RATE_LIMITED",
    `During their first ${NEW_ACCOUNT_DAYS} days, accounts can create up to ${NEW_ACCOUNT_CODES_PER_HOUR} dynamic codes per hour. Please try again later.`,
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
