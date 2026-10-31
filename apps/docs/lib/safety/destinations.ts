import "server-only";

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
 * - new accounts are capped at NEW_ACCOUNT_CODES_PER_HOUR new codes.
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

/**
 * For createCodes: checks every row's destination and returns the rows, with
 * held ones (new account + suspicious URL) set to `isActive: false`.
 */
export async function screenNewCodes<
  T extends { id: string; destinationUrl: string },
>(
  scope: { userId: string },
  rows: T[],
): Promise<(T & { isActive?: boolean })[]> {
  if (rows.length === 0) return rows;
  await enforceNewAccountVelocity(scope.userId, rows.length);

  const checks = await mapWithConcurrency(rows, LOOKUP_CONCURRENCY, (row) =>
    checkUrlSafety(row.destinationUrl),
  );
  for (const [index, safety] of checks.entries()) {
    if (safety.verdict === "block") {
      throw unsafeUrl((rows[index] as T).destinationUrl, safety);
    }
  }
  if (!checks.some((safety) => safety.verdict === "review")) return rows;
  if (!(await getAccountStanding(scope.userId)).isNew) return rows;

  const holds: HoldRequest[] = [];
  const screened = rows.map((row, index) => {
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
