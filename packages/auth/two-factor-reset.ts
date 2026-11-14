import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";

// Support turning off someone's two-step verification (they lost their
// authenticator app, passkeys and backup codes) waits TWO_FACTOR_RESET_WAIT
// _DAYS with a notice to the account's address, like moving an account to a
// new email: whoever wrote to support may not be the account's owner. The
// app schedules, shows, cancels and completes it
// (apps/app/lib/account/two-factor-reset-server.tsx); this file holds what
// both sides share, and cancels it when the person signs in with an
// authenticator code or a backup code, which shows they still have them.
//
// A passkey never cancels it on its own, as the second step or with
// "Continue with passkey": the reset is for a lost device, and a passkey on
// that device mustn't be able to block it. Passkeys survive the reset, so
// the person can still press Cancel in Settings (confirming with one).
//
// A pending reset is a `verification` row, `qrdx-2fa-reset-<userId>`,
// holding a TwoFactorResetRecord as JSON; no schema change. Its expiresAt is
// a month past the due date, so pruning expired rows can never drop one the
// daily cron hasn't completed yet.

export const TWO_FACTOR_RESET_WAIT_DAYS = 7;
/** How long the row is kept past its due date (see above). */
export const TWO_FACTOR_RESET_KEEP_DAYS = 30;
export const TWO_FACTOR_RESET_PREFIX = "qrdx-2fa-reset-";

const DAY_MS = 24 * 60 * 60 * 1000;

export function twoFactorResetIdentifier(userId: string): string {
  return `${TWO_FACTOR_RESET_PREFIX}${userId}`;
}

/** What a pending reset row holds. */
export interface TwoFactorResetRecord {
  /** ISO time from which the daily cron turns it off */
  dueAt: string;
  /** ISO time support started it */
  requestedAt: string;
  /** The admin who started it */
  requestedBy: { id: string; email: string };
}

/**
 * When a reset started at `requestedAt` is due: the start of the first UTC
 * day at least TWO_FACTOR_RESET_WAIT_DAYS later. The daily cron completes it
 * that day, so the date in the notice is the day it happens, after at least
 * the full wait.
 */
export function twoFactorResetDueAt(requestedAt: Date): Date {
  const earliest = requestedAt.getTime() + TWO_FACTOR_RESET_WAIT_DAYS * DAY_MS;
  return new Date(Math.ceil(earliest / DAY_MS) * DAY_MS);
}

/** The row's expiry: kept a month past due (see above). */
export function twoFactorResetKeepUntil(dueAt: Date): Date {
  return new Date(dueAt.getTime() + TWO_FACTOR_RESET_KEEP_DAYS * DAY_MS);
}

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

/** A row's value, or null when it isn't one of ours. */
export function parseTwoFactorReset(
  value: string
): TwoFactorResetRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<TwoFactorResetRecord>;
    const by = parsed.requestedBy;
    if (
      isIsoDate(parsed.dueAt) &&
      isIsoDate(parsed.requestedAt) &&
      typeof by?.id === "string" &&
      typeof by.email === "string"
    ) {
      return {
        dueAt: parsed.dueAt,
        requestedAt: parsed.requestedAt,
        requestedBy: { id: by.id, email: by.email },
      };
    }
  } catch {
    // Not JSON.
  }
  return null;
}

/**
 * The sign-ins that cancel a pending reset: the second step answered with an
 * authenticator code or a backup code. Never a passkey (see above).
 */
export const RESET_CANCELLING_SIGN_IN_PATHS: readonly string[] = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
];

export const signInCancelsTwoFactorReset = (path: string): boolean =>
  RESET_CANCELLING_SIGN_IN_PATHS.includes(path);

/** A sign-in with the second step cancelled a pending reset. */
export interface TwoFactorResetCancelled {
  user: { id: string; email: string };
  record: TwoFactorResetRecord | null;
  /** The sign-in request's headers: the app reads device and place from them */
  headers: Headers;
}

/** Emails the person and writes the audit entry. Throw when it failed. */
export type TwoFactorResetCancelledNotifier = (
  cancelled: TwoFactorResetCancelled
) => Promise<void> | void;

// On globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the notifier the app registered.
const NOTIFIER = Symbol.for("@repo/auth/two-factor-reset-cancelled");
type NotifierSlot = Record<symbol, TwoFactorResetCancelledNotifier | undefined>;

export function registerTwoFactorResetCancelledNotifier(
  notifier: TwoFactorResetCancelledNotifier
): void {
  (globalThis as unknown as NotifierSlot)[NOTIFIER] = notifier;
}

// No ids, emails or addresses in these logs.
function log(level: "info" | "error", fields: Record<string, unknown>) {
  console[level](JSON.stringify({ event: "auth.two_factor_reset", ...fields }));
}

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

interface NewSession {
  user: { id: string; email?: string | null };
}

/**
 * After an HTTP sign-in that answered the second step with an authenticator
 * code or a backup code: a pending reset of that account is deleted, and the
 * app is told. Never blocks or fails the sign-in.
 */
async function cancelOnStrongSignIn(ctx: HookContext): Promise<void> {
  if (!(ctx.request instanceof Request)) return;
  const data = ctx.context.newSession as NewSession | null;
  if (!data) return;
  const returned = ctx.context.returned;
  if (isAPIError(returned) && returned.statusCode >= 400) return;

  const identifier = twoFactorResetIdentifier(data.user.id);
  const where = [{ field: "identifier", value: identifier }];
  const row = await ctx.context.adapter.findOne<{ value: string }>({
    model: "verification",
    where,
  });
  if (!row) return;
  await ctx.context.adapter.deleteMany({ model: "verification", where });
  log("info", { outcome: "cancelled-by-sign-in" });

  const notifier = (globalThis as unknown as NotifierSlot)[NOTIFIER];
  if (!notifier) {
    log("error", { outcome: "no-notifier" });
    return;
  }
  const email =
    data.user.email ??
    (await ctx.context.internalAdapter.findUserById(data.user.id))?.email;
  if (!email) {
    log("error", { outcome: "no-email" });
    return;
  }
  await notifier({
    user: { id: data.user.id, email },
    record: parseTwoFactorReset(row.value),
    headers: new Headers(ctx.request.headers),
  });
}

export const twoFactorResetCancel = () =>
  ({
    id: "qrdx-two-factor-reset",
    hooks: {
      after: [
        {
          matcher: (ctx) => signInCancelsTwoFactorReset(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            try {
              await cancelOnStrongSignIn(ctx);
            } catch (error) {
              log("error", {
                outcome: "failed",
                error: error instanceof Error ? error.name : "unknown",
              });
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
