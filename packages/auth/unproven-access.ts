import {
  apiKey,
  database as db,
  eq,
  knownDevice,
  oauthAuthorizationCode,
  oauthToken,
  passkey,
  session,
  twoFactor,
  user,
  verification,
} from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import { CONFIRMED_IDENTIFIER_PREFIX } from "./confirm-sign-in-rules";

// An account made before anyone proved its address (a Google or GitHub
// sign-up the provider hadn't verified, from before ./verified-sign-up.ts)
// may belong to someone who doesn't own the mailbox. When the owner proves
// it with an email code, Better Auth removes the account's Google and GitHub
// links and signs out every session, then marks the address verified
// (better-auth/dist/db/revoke-unproven-account-access.mjs). Just before that
// update, this removes what the earlier holder could still use, or could
// have left behind, to get back in:
//
// - two-step verification: switched off, its authenticator secret and
//   backup codes deleted. Otherwise the owner would be asked for a second
//   step only the earlier holder can answer.
// - trusted devices ("Don't ask again on this device"): forgotten, as when
//   two-step verification is turned off.
// - passkeys: deleted. Each one signs in on its own.
// - API keys: revoked (the rows stay, like any revoked key).
// - OAuth app grants: tokens revoked, unused authorization codes spent, so
//   an app the earlier holder authorised can't act as the account.
// - known browsers (new sign-in alerts, ./new-sign-in.ts): forgotten. They
//   let nobody in, but they'd keep the owner from hearing about a sign-in
//   from the earlier holder's browsers.
// - "Confirm it's you" confirmations: deleted (their sessions are gone too).
// - sessions: deleted again, in case one was made between Better Auth's
//   sign-out and this, before the methods above were gone.
//
// All of it in one batch, two-step verification first, before the address
// is marked verified and before the owner's session exists. If it fails, the
// sign-in fails (and the address stays unproven), so the owner never gets an
// account the earlier holder can still reach; they can try again.
//
// Only an email-code sign-in counts as the proof. A provider that later
// verifies the address for an account it's already linked to proves the
// same person who signed up holds the mailbox, so nothing is removed then.

const SIGN_IN_CODE_PATH = "/sign-in/email-otp";
const TRUSTED_DEVICE_PREFIX = "trust-device-";

/** What was removed (counts only), for the log. */
export interface UnprovenAccessRemoved {
  twoFactor: number;
  trustedDevices: number;
  passkeys: number;
  apiKeys: number;
  oauthTokens: number;
  oauthCodes: number;
  knownDevices: number;
  confirmations: number;
  sessions: number;
}

const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);

/** Removes everything listed above from `userId`'s account. */
export async function removeUnprovenAccess(
  userId: string
): Promise<UnprovenAccessRemoved> {
  const verificationIds = (prefix: string) =>
    db.query.verification.findMany({
      columns: { id: true },
      where: (table, { and, eq: equals, like }) =>
        and(equals(table.value, userId), like(table.identifier, `${prefix}%`)),
    });
  const [trusted, confirmations, keys, tokens, codes] = await Promise.all([
    verificationIds(TRUSTED_DEVICE_PREFIX),
    verificationIds(CONFIRMED_IDENTIFIER_PREFIX),
    db.query.apiKey.findMany({
      columns: { id: true },
      where: (table, { and, eq: equals, isNull }) =>
        and(equals(table.userId, userId), isNull(table.revokedAt)),
    }),
    db.query.oauthToken.findMany({
      columns: { id: true },
      where: (table, { and, eq: equals, isNull }) =>
        and(equals(table.userId, userId), isNull(table.revokedAt)),
    }),
    db.query.oauthAuthorizationCode.findMany({
      columns: { id: true },
      where: (table, { and, eq: equals, isNull }) =>
        and(equals(table.userId, userId), isNull(table.usedAt)),
    }),
  ]);
  const now = new Date();
  const results = await db.batch([
    // The switch goes off first: never on with nothing left to answer it.
    db
      .update(user)
      .set({ twoFactorEnabled: false, updatedAt: now })
      .where(eq(user.id, userId)),
    db
      .delete(twoFactor)
      .where(eq(twoFactor.userId, userId))
      .returning({ id: twoFactor.id }),
    db
      .delete(passkey)
      .where(eq(passkey.userId, userId))
      .returning({ id: passkey.id }),
    db
      .delete(knownDevice)
      .where(eq(knownDevice.userId, userId))
      .returning({ id: knownDevice.id }),
    ...idsOf([...trusted, ...confirmations]).map((id) =>
      db.delete(verification).where(eq(verification.id, id))
    ),
    ...idsOf(keys).map((id) =>
      db
        .update(apiKey)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(apiKey.id, id))
    ),
    ...idsOf(tokens).map((id) =>
      db
        .update(oauthToken)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(oauthToken.id, id))
    ),
    ...idsOf(codes).map((id) =>
      db
        .update(oauthAuthorizationCode)
        .set({ usedAt: now })
        .where(eq(oauthAuthorizationCode.id, id))
    ),
    db
      .delete(session)
      .where(eq(session.userId, userId))
      .returning({ id: session.id }),
  ]);
  const count = (index: number) => (results[index] as unknown[]).length;
  return {
    twoFactor: count(1),
    passkeys: count(2),
    knownDevices: count(3),
    trustedDevices: trusted.length,
    confirmations: confirmations.length,
    apiKeys: keys.length,
    oauthTokens: tokens.length,
    oauthCodes: codes.length,
    sessions: count(results.length - 1),
  };
}

/** What the update hook gets as its context (the endpoint's), or null. */
interface HookContext {
  path?: string;
  body?: { email?: unknown } | null;
}

// No ids or addresses in these logs.
function log(level: "warn" | "error", fields: Record<string, unknown>) {
  console[level](
    JSON.stringify({ event: "auth.unproven_access_removed", ...fields })
  );
}

/**
 * user.update.before: when an email-code sign-in is about to mark an
 * unproven account's address verified, the account is cleared first. Any
 * other update passes.
 */
export async function beforeAddressProven(
  data: { emailVerified?: unknown },
  context: HookContext | null | undefined
): Promise<void> {
  if (data.emailVerified !== true || context?.path !== SIGN_IN_CODE_PATH) {
    return;
  }
  const email = context.body?.email;
  if (typeof email !== "string") return;
  // The account the endpoint found: it looks the address up lower-cased.
  const account = await db.query.user.findFirst({
    columns: { id: true, emailVerified: true },
    where: (table, { eq: equals }) => equals(table.email, email.toLowerCase()),
  });
  if (!account || account.emailVerified) return;
  try {
    const removed = await removeUnprovenAccess(account.id);
    log("warn", { outcome: "removed", ...removed });
  } catch (error) {
    log("error", {
      outcome: "failed",
      error: error instanceof Error ? error.name : "unknown",
      message:
        error instanceof Error
          ? error.message.split(/\bparams:/)[0].slice(0, 300)
          : undefined,
    });
    throw error;
  }
}

/** Registered in ./server.ts. */
export const unprovenAccessCleanup = () =>
  ({
    id: "qrdx-unproven-access",
    init() {
      return {
        options: {
          databaseHooks: {
            user: {
              update: {
                before: async (data, context) => {
                  await beforeAddressProven(data, context);
                },
              },
            },
          },
        },
      };
    },
  }) satisfies BetterAuthPlugin;
