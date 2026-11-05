import { Link } from "react-email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";

const SUPPORT_EMAIL = "support@qrdx.dev";

/** What changed about the account's two-step verification. */
export type TwoFactorNoticeKind = "on" | "off" | "backup-codes" | "support-off";

const NOTICES: Record<
  TwoFactorNoticeKind,
  { subject: string; heading: string; body: string }
> = {
  on: {
    subject: "Two-step verification is on for your QRdx account",
    heading: "Two-step verification is on",
    body: "Signing in to QRdx now asks for a code from your authenticator app, or one of your backup codes.",
  },
  off: {
    subject: "Two-step verification was turned off on your QRdx account",
    heading: "Two-step verification is off",
    body: "Signing in to QRdx no longer asks for a code from your authenticator app. Your backup codes no longer work.",
  },
  "backup-codes": {
    subject: "New backup codes for your QRdx account",
    heading: "You have new backup codes",
    body: "New backup codes were made for your QRdx account. The old ones no longer work.",
  },
  "support-off": {
    subject: "QRdx support turned off two-step verification",
    heading: "Two-step verification is off",
    body: "QRdx support turned off two-step verification for your account. Signing in no longer asks for an authenticator code. You can turn it on again in Settings → Profile & security.",
  },
};

export const twoFactorNoticeSubject = (kind: TwoFactorNoticeKind) =>
  NOTICES[kind].subject;

/**
 * Transactional, to the account's address after a two-step verification
 * change. No links that change anything; a reply to support from this
 * address is the way back.
 */
export function TwoFactorNoticeEmail({ kind }: { kind: TwoFactorNoticeKind }) {
  const notice = NOTICES[kind];
  return (
    <EmailLayout
      preview={notice.body}
      reason="You got this email because it's the address of a QRdx account, and its sign-in security changed."
    >
      <EmailHeading>{notice.heading}</EmailHeading>
      <EmailText>{notice.body}</EmailText>
      {kind !== "support-off" && (
        <EmailText>If this was you, there's nothing else to do.</EmailText>
      )}
      <EmailDivider />
      <MutedText>
        If this wasn't you, contact support at{" "}
        <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link> from this
        address straight away, and we'll help you secure your account.
      </MutedText>
    </EmailLayout>
  );
}
