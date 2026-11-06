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
  | "support-off";

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
    body: "QRdx support turned off two-step verification for your account. Signing in no longer asks for a second step. You can turn it on again in Settings → Profile & security.",
  },
};

export const twoFactorNoticeSubject = (kind: TwoFactorNoticeKind) =>
  NOTICES[kind].subject;

/**
 * Transactional, to the account's address after a two-step verification
 * change, with where and when it happened. The only links go to the
 * security settings and support; nothing in it changes the account.
 */
export function TwoFactorNoticeEmail({
  kind,
  details,
}: {
  kind: TwoFactorNoticeKind;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
}) {
  const notice = NOTICES[kind];
  return (
    <EmailLayout
      preview={notice.body}
      reason="You got this email because it's the address of a QRdx account, and its sign-in security changed."
    >
      <EmailHeading>{notice.heading}</EmailHeading>
      <EmailText>{notice.body}</EmailText>
      <SecurityDetails details={details} />
      {kind !== "support-off" && (
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
