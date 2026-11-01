import { Link } from "react-email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import { EmailCodeBox } from "./sign-in-code";

const SUPPORT_EMAIL = "support@qrdx.dev";

export const EMAIL_CHANGE_CODE_SUBJECT = "Confirm your new email for QRdx";
export const EMAIL_CHANGED_SUBJECT = "Your QRdx email was changed";

const plural = (minutes: number) =>
  `${minutes} minute${minutes === 1 ? "" : "s"}`;

export interface EmailChangeCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes?: number;
}

/**
 * Transactional, to the NEW address: the code that confirms it. No links, so
 * nothing in it changes the account by itself.
 */
export function EmailChangeCodeEmail({
  code,
  expiresInMinutes = 5,
}: EmailChangeCodeEmailProps) {
  const expiry = plural(expiresInMinutes);
  return (
    <EmailLayout
      preview={`Enter this code to confirm your new email. It expires in ${expiry}.`}
      reason="You got this email because someone asked to move a QRdx account to this address."
    >
      <EmailHeading>Confirm your new email</EmailHeading>
      <EmailText>
        Enter this code in QRdx to make this the email for your account:
      </EmailText>
      <EmailCodeBox code={code} />
      <EmailText>
        The code expires in {expiry} and works once. Don't share it with anyone.
      </EmailText>
      <EmailDivider />
      <MutedText>
        If you didn't ask for this, ignore this email. Nothing changes without
        the code.
      </MutedText>
    </EmailLayout>
  );
}

export interface EmailChangedEmailProps {
  /** The account's address from now on */
  newEmail: string;
}

/**
 * Transactional, to the OLD address after the change. Deliberately no link
 * that undoes it: a reply to support (from this address) is the way back.
 */
export function EmailChangedEmail({ newEmail }: EmailChangedEmailProps) {
  return (
    <EmailLayout
      preview={`Your QRdx account now uses ${newEmail}.`}
      reason="You got this email because this address was the email for a QRdx account."
    >
      <EmailHeading>Your QRdx email was changed</EmailHeading>
      <EmailText>
        Your QRdx account now uses <strong>{newEmail}</strong>. Sign-in codes
        and team invitations go there from now on.
      </EmailText>
      <EmailText>If this was you, there's nothing else to do.</EmailText>
      <EmailDivider />
      <MutedText>
        If this wasn't you, contact support at{" "}
        <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link> from this
        address straight away, and we'll help you get your account back.
      </MutedText>
    </EmailLayout>
  );
}
