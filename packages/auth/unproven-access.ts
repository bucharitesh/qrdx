import {
  and,
  apiKey,
  database as db,
  eq,
  inArray,
  integration,
  isNull,
  knownDevice,
  like,
  notificationSetting,
  oauthAuthorizationCode,
  oauthToken,
  passkey,
  session,
  twoFactor,
  user,
  verification,
  webhookEndpoint,
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
// have left behind, to get back in or to keep receiving the account's data:
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
// - webhook endpoints it made (with their queued deliveries), and its Slack
//   and Discord alert targets: they send events, form answers included, to
//   addresses the earlier holder chose. Email alerts stay: they only ever go
//   to the account's own address.
// - its data-out syncs (DATA_OUT_PROVIDERS) and the Slack connection behind
//   those alerts: they send scans and form answers to the earlier holder's
//   accounts elsewhere. The rows go, so QRdx stops; their tokens aren't
//   revoked at the provider (they're for the earlier holder's own account
//   there).
// - known browsers (new sign-in alerts, ./new-sign-in.ts): forgotten. They
//   let nobody in, but they'd keep the owner from hearing about a sign-in
//   from the earlier holder's browsers.
// - "Confirm it's you" confirmations: deleted (their sessions are gone too).
// - sessions: deleted again, in case one was made between Better Auth's
//   sign-out and this, before the methods above were gone.
//
// Workspaces and everything in them stay.
//
// All of it in one batch, one statement per table (however many rows),
// two-step verification first, before the address is marked verified and
// before the owner's session exists. If it fails, the sign-in fails (and the
// address stays unproven), so the owner never gets an account the earlier
// holder can still reach; they can try again.
//
// Only an email-code sign-in counts as the proof. A provider that later
// verifies the address for an account it's already linked to proves the
// same person who signed up holds the mailbox, so nothing is removed then.

const SIGN_IN_CODE_PATH = "/sign-in/email-otp";
const TRUSTED_DEVICE_PREFIX = "trust-device-";

/**
 * Integrations that send the account's data out: the data-out syncs
 * (@repo/integrations SINK_PROVIDERS; a test keeps the two in step) and
 * Slack, whose channels are alert targets.
 */
export const DATA_OUT_PROVIDERS = [
  "google-sheets",
  "hubspot",
  "mailchimp",
  "slack",
] as const;

/** Alert channels that post to an address someone chose (not email). */
const CHAT_CHANNELS = ["slack", "discord"] as const;

/** What was removed (counts only), for the log. */
export interface UnprovenAccessRemoved {
  twoFactor: number;
  trustedDevices: number;
  passkeys: number;
  apiKeys: number;
  oauthTokens: number;
  oauthCodes: number;
  webhooks: number;
  chatAlerts: number;
  dataOut: number;
  knownDevices: number;
  confirmations: number;
  sessions: number;
}

/** Removes everything listed above from `userId`'s account. */
export async function removeUnprovenAccess(
  userId: string
): Promise<UnprovenAccessRemoved> {
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
      .delete(verification)
      .where(
        and(
          eq(verification.value, userId),
          like(verification.identifier, `${TRUSTED_DEVICE_PREFIX}%`)
        )
      )
      .returning({ id: verification.id }),
    db
      .update(apiKey)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(apiKey.userId, userId), isNull(apiKey.revokedAt)))
      .returning({ id: apiKey.id }),
    db
      .update(oauthToken)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(oauthToken.userId, userId), isNull(oauthToken.revokedAt)))
      .returning({ id: oauthToken.id }),
    db
      .update(oauthAuthorizationCode)
      .set({ usedAt: now })
      .where(
        and(
          eq(oauthAuthorizationCode.userId, userId),
          isNull(oauthAuthorizationCode.usedAt)
        )
      )
      .returning({ id: oauthAuthorizationCode.id }),
    db
      .delete(webhookEndpoint)
      .where(eq(webhookEndpoint.userId, userId))
      .returning({ id: webhookEndpoint.id }),
    db
      .delete(notificationSetting)
      .where(
        and(
          eq(notificationSetting.userId, userId),
          inArray(notificationSetting.channel, [...CHAT_CHANNELS])
        )
      )
      .returning({ id: notificationSetting.id }),
    db
      .delete(integration)
      .where(
        and(
          eq(integration.userId, userId),
          inArray(integration.provider, [...DATA_OUT_PROVIDERS])
        )
      )
      .returning({ id: integration.id }),
    db
      .delete(knownDevice)
      .where(eq(knownDevice.userId, userId))
      .returning({ id: knownDevice.id }),
    db
      .delete(verification)
      .where(
        and(
          eq(verification.value, userId),
          like(verification.identifier, `${CONFIRMED_IDENTIFIER_PREFIX}%`)
        )
      )
      .returning({ id: verification.id }),
    db
      .delete(session)
      .where(eq(session.userId, userId))
      .returning({ id: session.id }),
  ]);
  const count = (index: number) => (results[index] as unknown[]).length;
  return {
    twoFactor: count(1),
    passkeys: count(2),
    trustedDevices: count(3),
    apiKeys: count(4),
    oauthTokens: count(5),
    oauthCodes: count(6),
    webhooks: count(7),
    chatAlerts: count(8),
    dataOut: count(9),
    knownDevices: count(10),
    confirmations: count(11),
    sessions: count(12),
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
