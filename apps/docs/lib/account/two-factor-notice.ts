/**
 * The notice emailed after a two-step verification change (turned on or off,
 * new backup codes, an authenticator app added or removed, a backup code
 * used) and about support's turn-off (scheduled, cancelled, done). Pure; the sender is
 * ./two-factor-notice-server.tsx.
 */
import type {
  TwoFactorNoticeExtra,
  TwoFactorNoticeKind,
} from "@/lib/email/templates/two-factor-notice";
import type { NoticeDeliveryDeps } from "./email-change";

export type { TwoFactorNoticeExtra, TwoFactorNoticeKind };

const DESCRIPTIONS: Record<TwoFactorNoticeKind, string> = {
  on: "two-step verification turned on",
  off: "two-step verification turned off",
  "backup-codes": "new backup codes",
  "app-added": "authenticator app added",
  "app-removed": "authenticator app removed",
  "support-off":
    "two-step verification turned off by support, every session signed out",
  "support-reset-scheduled": "support will turn off two-step verification",
  "support-reset-cancelled":
    "support's turn-off of two-step verification cancelled",
  "backup-code-used": "a backup code was used",
};

/** What the notice says, in a few words (for the local dev log). */
export function describeTwoFactorNotice(
  kind: TwoFactorNoticeKind,
  extra: TwoFactorNoticeExtra = {},
): string {
  const parts = [DESCRIPTIONS[kind]];
  if (kind === "on" && extra.signedOutElsewhere) {
    parts.push("other sessions signed out");
  }
  if (kind === "support-reset-scheduled" && extra.dueDate) {
    parts.push(`on ${extra.dueDate}`);
  }
  if (kind === "support-reset-cancelled" && extra.cancelledBy) {
    parts.push(`by ${extra.cancelledBy}`);
  }
  if (kind === "backup-code-used") {
    parts[0] = `${DESCRIPTIONS[kind]} to ${extra.usedFor === "confirm" ? "confirm it's you" : "sign in"}`;
    if (typeof extra.codesLeft === "number") {
      parts.push(`${extra.codesLeft} left`);
    }
  }
  return parts.join(", ");
}

/** What became of a notice: emailed, written to the local dev log, or neither. */
export type TwoFactorNoticeOutcome = "emailed" | "logged" | "not-sent";

/** A database on this machine (localhost, 127.0.0.1 or ::1). */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Whether support's turn-off of two-step verification may be scheduled after
 * its notice went out this way. The notice is the point of the 7-day wait: it
 * lets an owner who didn't ask stop it. So:
 * - emailed: yes;
 * - written to the dev log: only in local development against a database on
 *   this machine, where the account is a test one and the production cron
 *   never sees the reset (the local end-to-end tests run like that). Never
 *   in production, and never against any other database: local dev and
 *   previews can share the production one, whose daily cron would turn off
 *   a real person's two-step verification after a notice nobody saw;
 * - not sent: no.
 */
export function resetNoticeDelivered(
  outcome: TwoFactorNoticeOutcome,
  {
    nodeEnv,
    databaseUrl,
  }: { nodeEnv: string | undefined; databaseUrl: string | undefined },
): boolean {
  if (outcome === "emailed") return true;
  return (
    outcome === "logged" &&
    nodeEnv !== "production" &&
    isLocalDatabaseUrl(databaseUrl)
  );
}

export const RESET_NOTICE_REFUSALS = {
  /** Delivery is off here (local dev, a preview), or email isn't set up. */
  noEmail:
    "This server doesn't send email, so the account's address can't be told and a reset can't be scheduled here.",
  /** It could have gone out, but didn't. */
  notSent:
    "The email to the account's address couldn't be sent, so nothing was scheduled. Try again in a few minutes.",
} as const;

/**
 * Why support's turn-off wasn't scheduled (resetNoticeDelivered said no).
 * `canSendEmail`: outbound delivery is on and email is set up. Without it the
 * notice never had a chance (a preview runs in production mode with delivery
 * off, so its notice is "not-sent", not "logged"), and trying again won't help.
 */
export function resetNoticeRefusal(
  outcome: TwoFactorNoticeOutcome,
  { canSendEmail }: { canSendEmail: boolean },
): string {
  return outcome === "not-sent" && canSendEmail
    ? RESET_NOTICE_REFUSALS.notSent
    : RESET_NOTICE_REFUSALS.noEmail;
}

/**
 * Emails the notice where outbound delivery is on, writes it to the console
 * in local dev. Never throws: the change has happened, so a failed notice is
 * reported (and logged by the caller), never undone.
 */
export async function deliverTwoFactorNotice(
  {
    kind,
    email,
    extra,
  }: { kind: TwoFactorNoticeKind; email: string; extra?: TwoFactorNoticeExtra },
  deps: NoticeDeliveryDeps,
): Promise<TwoFactorNoticeOutcome> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx security notice for ${email}: ${describeTwoFactorNotice(kind, extra)} (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
