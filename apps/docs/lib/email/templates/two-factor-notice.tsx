import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  SupportLink,
} from "./security-parts";

/** What changed about the account's two-step verification. */
export type TwoFactorNoticeKind =
  | "on"
  | "off"
  | "backup-codes"
  | "app-added"
  | "app-removed"
  | "support-off"
  | "support-reset-scheduled"
  | "support-reset-cancelled"
  | "backup-code-used";

/** What a backup code was used for. */
export type BackupCodeUsedFor = "sign-in" | "confirm";

/** Who cancelled support's pending turn-off. */
export type TwoFactorResetCancelledBy = "person" | "sign-in" | "support";

/**
 * At or below this many backup codes left, the "backup code used" notice
 * suggests making new ones.
 */
export const BACKUP_CODES_LOW = 2;

/** What some notices add to their fixed text. */
export interface TwoFactorNoticeExtra {
  /** "on": every other session of the account was signed out */
  signedOutElsewhere?: boolean;
  /** "backup-code-used": what the code was used for */
  usedFor?: BackupCodeUsedFor;
  /** "backup-code-used": codes left after it; null when unknown */
  codesLeft?: number | null;
  /** "support-reset-scheduled": the day it turns off, e.g. "November 16, 2026" */
  dueDate?: string;
  /** "support-reset-cancelled": who cancelled it */
  cancelledBy?: TwoFactorResetCancelledBy;
}

const NOTICES: Record<
  TwoFactorNoticeKind,
  { subject: string; heading: string; body: string }
> = {
  on: {
    subject: "Two-step verification is on for your QRdx account",
    heading: "Two-step verification is on",
    body: "Signing in to QRdx now asks for a second step: your passkey or a code from your authenticator app. A backup code works when you can't use either.",
  },
  off: {
    subject: "Two-step verification was turned off on your QRdx account",
    heading: "Two-step verification is off",
    body: "Signing in to QRdx no longer asks for a second step. Your backup codes no longer work.",
  },
  "backup-codes": {
    subject: "New backup codes for your QRdx account",
    heading: "You have new backup codes",
    body: "New backup codes were made for your QRdx account. The old ones no longer work.",
  },
  "app-added": {
    subject: "An authenticator app was added to your QRdx account",
    heading: "Authenticator app added",
    body: "Codes from the authenticator app you just set up now work as the second step when you sign in to QRdx.",
  },
  "app-removed": {
    subject: "The authenticator app was removed from your QRdx account",
    heading: "Authenticator app removed",
    body: "Codes from your authenticator app no longer work for signing in to QRdx. Two-step verification stays on with your other methods.",
  },
  "support-off": {
    subject: "QRdx support turned off two-step verification",
    heading: "Two-step verification is off",
    body: "QRdx support turned off two-step verification for your account and signed it out on every device. Signing in no longer asks for a second step. You can turn it on again in Settings → Profile & security.",
  },
  "support-reset-scheduled": {
    subject: "QRdx support will turn off two-step verification",
    heading: "Support will turn off two-step verification",
    body: "Someone asked QRdx support to turn off two-step verification for your account, saying they lost every way to do the second step.",
  },
  "support-reset-cancelled": {
    subject: "Two-step verification stays on for your QRdx account",
    heading: "Two-step verification stays on",
    body: "Support's request to turn off two-step verification for your account was cancelled. Nothing changed.",
  },
  "backup-code-used": {
    subject: "A backup code was used on your QRdx account",
    heading: "A backup code was used",
    body: "One of your backup codes was just used to sign in to your QRdx account. Each code works once, so that one no longer works.",
  },
};

export const twoFactorNoticeSubject = (kind: TwoFactorNoticeKind) =>
  NOTICES[kind].subject;

/** "You have 3 backup codes left." and, when few are left, what to do. */
export function backupCodesLeftText(codesLeft: number): string {
  const left =
    codesLeft === 0
      ? "That was your last backup code."
      : `You have ${codesLeft} backup ${codesLeft === 1 ? "code" : "codes"} left.`;
  return codesLeft <= BACKUP_CODES_LOW
    ? `${left} Make new ones in Settings → Profile & security, so you still have a way in when you can't use your passkey or authenticator app.`
    : left;
}

/** The notice's paragraphs, before the details table. */
export function twoFactorNoticeLines(
  kind: TwoFactorNoticeKind,
  extra: TwoFactorNoticeExtra = {},
): string[] {
  if (kind === "support-reset-scheduled") {
    const when = extra.dueDate ? `on ${extra.dueDate} (UTC)` : "in 7 days";
    return [
      NOTICES[kind].body,
      `Support will turn it off ${when} and sign your account out on every device. Until then, nothing changes.`,
      "If you asked for this, there's nothing to do. If you didn't, sign in to QRdx with your passkey, authenticator app or a backup code: that cancels it. Or cancel it in Settings → Profile & security, or reply to this email.",
    ];
  }
  if (kind === "support-reset-cancelled") {
    const why: Record<TwoFactorResetCancelledBy, string> = {
      person:
        "You cancelled support's request to turn off two-step verification for your QRdx account.",
      "sign-in":
        "You signed in with your second step, so support's request to turn off two-step verification for your QRdx account was cancelled.",
      support:
        "QRdx support cancelled the request to turn off two-step verification for your account.",
    };
    return [
      extra.cancelledBy ? why[extra.cancelledBy] : NOTICES[kind].body,
      "Two-step verification stays on, with your backup codes and methods as they were.",
    ];
  }
  if (kind === "backup-code-used") {
    const used =
      extra.usedFor === "confirm"
        ? "One of your backup codes was just used to confirm it's you before a security change on your QRdx account. Each code works once, so that one no longer works."
        : NOTICES[kind].body;
    return typeof extra.codesLeft === "number"
      ? [used, backupCodesLeftText(extra.codesLeft)]
      : [used];
  }
  if (kind === "on" && extra.signedOutElsewhere) {
    return [
      NOTICES.on.body,
      "Every other device signed in to your account was signed out, so each one now signs in again with the second step.",
    ];
  }
  return [NOTICES[kind].body];
}

/** Support's changes: these say themselves what to do. */
export const SUPPORT_KINDS: ReadonlySet<TwoFactorNoticeKind> = new Set([
  "support-off",
  "support-reset-scheduled",
  "support-reset-cancelled",
]);

/** Whether a "backup code used" notice asks the person to act. */
const asksForNewCodes = (
  kind: TwoFactorNoticeKind,
  extra: TwoFactorNoticeExtra,
) =>
  kind === "backup-code-used" &&
  typeof extra.codesLeft === "number" &&
  extra.codesLeft <= BACKUP_CODES_LOW;

/**
 * Transactional, to the account's address after a two-step verification
 * change, with where and when it happened. The only links go to the
 * security settings and support; nothing in it changes the account.
 */
export function TwoFactorNoticeEmail({
  kind,
  details,
  extra = {},
}: {
  kind: TwoFactorNoticeKind;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
  extra?: TwoFactorNoticeExtra;
}) {
  const notice = NOTICES[kind];
  const lines = twoFactorNoticeLines(kind, extra);
  return (
    <EmailLayout
      preview={lines[0] ?? notice.body}
      reason="You got this email because it's the address of a QRdx account, and its sign-in security changed."
    >
      <EmailHeading>{notice.heading}</EmailHeading>
      {lines.map((line) => (
        <EmailText key={line}>{line}</EmailText>
      ))}
      <SecurityDetails details={details} />
      {!SUPPORT_KINDS.has(kind) && !asksForNewCodes(kind, extra) && (
        <EmailText>If this was you, there's nothing else to do.</EmailText>
      )}
      <ReviewSecurityButton />
      <EmailDivider />
      <MutedText>
        If this wasn't you, contact support at <SupportLink /> from this address
        straight away, and we'll help you secure your account.
      </MutedText>
    </EmailLayout>
  );
}
