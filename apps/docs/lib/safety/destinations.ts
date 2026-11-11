import "server-only";

import { batchMessage } from "@/app/(app)/dashboard/codes/_lib/bulk";
import { HttpError } from "@/lib/error-response";
import {
  checkUrlSafety,
  describeSafety,
  mapWithConcurrency,
  THREAT_LABELS,
  type UrlSafety,
} from "./check";
import {
  enforceNewAccountVelocity,
  fileHoldReports,
  getAccountStanding,
  type HoldRequest,
} from "./velocity";

/**
 * Safety screen for the URLs a dynamic code sends visitors to:
 * - Web Risk threats, dangerous schemes and invalid URLs are rejected (422);
 * - suspicious URLs (shorteners, IP hosts, lookalike domains) from accounts
 *   in their first days are saved with the code switched off and an open
 *   "auto-hold" report for /admin/abuse;
 * - new accounts are capped at NEW_ACCOUNT_CODES_PER_HOUR new codes an hour
 *   (NEW_PAID_ACCOUNT_CODES_PER_HOUR in a paid workspace).
 */

const LOOKUP_CONCURRENCY = 8;

function unsafeUrl(url: string, safety: UrlSafety): HttpError {
  const host = safety.displayHostname ?? url.slice(0, 100);
  const threats = safety.threats.map((threat) => THREAT_LABELS[threat]);
  return new HttpError(
    422,
    "UNSAFE_DESTINATION",
    threats.length > 0
      ? `Google Web Risk flags the link to ${host} as ${threats.join(" and ")}, so it can't be used.`
      : `The link to ${host} can't be used for a QR code.`,
  );
}

/** Lookups at a time for a batch of this many rows (Web Risk is per URL). */
export function lookupConcurrency(rows: number): number {
  return rows > 50 ? 16 : LOOKUP_CONCURRENCY;
}

/**
 * For createCodes: checks every row's destination and returns the rows, with
 * held ones (new account + suspicious URL) set to `isActive: false`.
 *
 * A batch stops waiting for Web Risk after `budgetMs`: rows not looked up by
 * then get the offline checks only, as during a Web Risk outage, so a large
 * batch stays inside the request's time limit. Blocked rows are listed in the
 * error's `data.details`, by `indexOf(position)` (the row's place in the
 * caller's request).
 */
export async function screenNewCodes<
  T extends { id: string; destinationUrl: string },
>(
  scope: { userId: string },
  rows: T[],
  {
    budgetMs = Number.POSITIVE_INFINITY,
    indexOf = (position: number) => position,
    paid = false,
  }: {
    budgetMs?: number;
    indexOf?: (position: number) => number;
    /** The codes go to a paid workspace (a higher new-account cap) */
    paid?: boolean;
  } = {},
): Promise<(T & { isActive?: boolean; webRiskRecheckAt?: Date })[]> {
  if (rows.length === 0) return rows;
  await enforceNewAccountVelocity(scope.userId, rows.length, { paid });

  const deadline = Date.now() + budgetMs;
  let skipped = 0;
  const checks = await mapWithConcurrency(
    rows,
    lookupConcurrency(rows.length),
    (row) => {
      const webRisk = Date.now() < deadline;
      if (!webRisk) skipped++;
      return checkUrlSafety(row.destinationUrl, { webRisk });
    },
  );
  if (skipped > 0) {
    console.warn(
      JSON.stringify({
        event: "safety.web_risk_budget_spent",
        rows: rows.length,
        skipped,
      }),
    );
  }
  const blocked = checks.flatMap((safety, position) =>
    safety.verdict === "block" ? [{ safety, position }] : [],
  );
  const [first] = blocked;
  if (first) {
    const error = unsafeUrl(
      (rows[first.position] as T).destinationUrl,
      first.safety,
    );
    if (rows.length === 1) throw error;
    const details = blocked.map(({ safety, position }) => {
      const index = indexOf(position);
      return {
        index,
        path: `${index}.destinationUrl`,
        message: unsafeUrl((rows[position] as T).destinationUrl, safety)
          .message,
      };
    });
    throw new HttpError(
      422,
      error.code,
      batchMessage(details, rows.length),
      undefined,
      undefined,
      { details },
    );
  }
  // Destinations Web Risk didn't answer for (out of time, unreachable) are
  // marked for a later lookup (lib/safety/recheck.ts).
  const now = new Date();
  const marked = checks.some((safety) => safety.webRiskSkipped)
    ? rows.map((row, index) =>
        checks[index]?.webRiskSkipped ? { ...row, webRiskRecheckAt: now } : row,
      )
    : rows;
  if (!checks.some((safety) => safety.verdict === "review")) return marked;
  if (!(await getAccountStanding(scope.userId)).isNew) return marked;

  const holds: HoldRequest[] = [];
  const screened = marked.map((row, index) => {
    const safety = checks[index] as UrlSafety;
    if (safety.verdict !== "review") return row;
    holds.push({
      qrCodeId: row.id,
      url: row.destinationUrl,
      field: "destination",
      reasons: describeSafety(safety),
    });
    return { ...row, isActive: false };
  });
  fileHoldReports(holds);
  return screened;
}

/**
 * For edits of a code's destination or fallback URL. Throws for unsafe URLs;
 * returns true when the code must be switched off pending review. Unchanged
 * URLs are not checked again.
 */
export async function screenUrlChange(
  scope: { userId: string },
  code: { id: string },
  change: { previous: string | null; next: string; field?: string },
): Promise<boolean> {
  if (change.next === change.previous) return false;

  const safety = await checkUrlSafety(change.next);
  if (safety.verdict === "block") throw unsafeUrl(change.next, safety);
  if (safety.verdict !== "review") return false;
  if (!(await getAccountStanding(scope.userId)).isNew) return false;

  fileHoldReports([
    {
      qrCodeId: code.id,
      url: change.next,
      field: change.field ?? "destination",
      reasons: describeSafety(safety),
    },
  ]);
  return true;
}
