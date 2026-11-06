import { Link } from "react-email";
import {
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "@/lib/email/templates/layout";
import { MutedText } from "@/lib/email/templates/parts";
import { EmailCodeBox } from "@/lib/email/templates/sign-in-code";
import { CONFIRMATION_CODE_MINUTES } from "./confirmation";

// The code that confirms it's you before a security change, for accounts
// without two-step verification (./confirmation-server.ts). Built from the
// sign-in code email's parts.

export const CONFIRMATION_CODE_SUBJECT = "Your QRdx confirmation code";

const SUPPORT_EMAIL = "support@qrdx.dev";

/** Transactional: the one-time confirmation code. No links that act. */
export function ConfirmationCodeEmail({
  code,
  expiresInMinutes = CONFIRMATION_CODE_MINUTES,
}: {
  /** The 6-digit code */
  code: string;
  expiresInMinutes?: number;
}) {
  const expiry = `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;
  return (
    <EmailLayout
      preview={`Enter this code to confirm it's you. It expires in ${expiry}.`}
      reason="You got this email because someone asked to change the security settings of the QRdx account with this address."
    >
      <EmailHeading>Your QRdx confirmation code</EmailHeading>
      <EmailText>
        Enter this code in QRdx to confirm it's you before changing your
        account's security settings:
      </EmailText>
      <EmailCodeBox code={code} />
      <EmailText>
        The code expires in {expiry} and works once. QRdx will never ask for
        this code by phone, chat or email.
      </EmailText>
      <EmailDivider />
      <MutedText>
        If you didn't ask for this, someone may be signed in to your account.
        Sign out of your other sessions in Settings and contact support at{" "}
        <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link>.
      </MutedText>
    </EmailLayout>
  );
}
