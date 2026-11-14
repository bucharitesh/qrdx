import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  SupportLink,
} from "./security-parts";

export type PasskeyChange = "added" | "removed";

export const PASSKEY_NOTICE_SUBJECTS: Record<PasskeyChange, string> = {
  added: "A passkey was added to your QRdx account",
  removed: "A passkey was removed from your QRdx account",
};

export interface PasskeyNoticeEmailProps {
  change: PasskeyChange;
  /** The passkey's name, e.g. "Chrome on macOS" */
  passkeyName: string;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
}

/**
 * Transactional security notice after a passkey is added or removed, with
 * where and when it happened. The only links go to the security settings and
 * support; nothing in it changes the account.
 */
export function PasskeyNoticeEmail({
  change,
  passkeyName,
  details,
}: PasskeyNoticeEmailProps) {
  const added = change === "added";
  return (
    <EmailLayout
      preview={
        added
          ? `The passkey "${passkeyName}" can now sign in to your QRdx account.`
          : `The passkey "${passkeyName}" can no longer sign in to your QRdx account.`
      }
      reason="You got this email because it's the address of a QRdx account, and we tell you about every change to how it signs in."
    >
      <EmailHeading>{PASSKEY_NOTICE_SUBJECTS[change]}</EmailHeading>
      <EmailText>
        {added ? (
          <>
            The passkey <strong>{passkeyName}</strong> can now sign in to your
            QRdx account, and works as your second step when two-step
            verification is on.
          </>
        ) : (
          <>
            The passkey <strong>{passkeyName}</strong> can no longer sign in to
            your QRdx account.
          </>
        )}
      </EmailText>
      <SecurityDetails details={details} />
      <EmailText>If this was you, there's nothing else to do.</EmailText>
      <ReviewSecurityButton />
      <EmailDivider />
      <MutedText>
        If this wasn't you, sign in and remove any passkey you don't recognise,
        then contact support at <SupportLink /> from this address.
      </MutedText>
    </EmailLayout>
  );
}
