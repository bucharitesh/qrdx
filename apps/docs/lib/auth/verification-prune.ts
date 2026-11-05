import "server-only";

import { database as db, verification } from "@repo/database";
import { inArray, lt } from "drizzle-orm";

/**
 * Better Auth's `verification` table holds short-lived values: sign-in and
 * email-change codes, two-step challenges and trusted devices, passkey
 * challenges (one per sign-in panel opened, for autofill) and SSO domain
 * tokens. Better Auth deletes a value when it's used, never when it simply
 * runs out, so abandoned ones pile up. The webhooks cron calls this on every
 * full run.
 *
 * Only rows that expired more than a day ago go, so nothing still valid (a
 * 30-day trusted device, a pending code) is touched and a just-expired code
 * can still be told apart from a wrong one.
 */
export const VERIFICATION_GRACE_MS = 24 * 60 * 60 * 1000;

export function verificationPruneCutoff(now: Date): Date {
  return new Date(now.getTime() - VERIFICATION_GRACE_MS);
}

/** Deletes expired rows in chunks; returns how many went. */
export async function pruneExpiredVerifications(
  now: Date = new Date(),
  { chunk = 5000, maxChunks = 10 } = {},
): Promise<number> {
  const cutoff = verificationPruneCutoff(now);
  let total = 0;
  for (let i = 0; i < maxChunks; i++) {
    const expired = db
      .select({ id: verification.id })
      .from(verification)
      .where(lt(verification.expiresAt, cutoff))
      .limit(chunk);
    const deleted = await db
      .delete(verification)
      .where(inArray(verification.id, expired))
      .returning({ id: verification.id });
    total += deleted.length;
    if (deleted.length < chunk) break;
  }
  return total;
}
