import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  NeverAskForCode,
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  SupportLink,
} from "./security-parts";
import { EmailCodeBox } from "./sign-in-code";

export const CONFIRMATION_CODE_SUBJECT = "Your QRdx confirmation code";

export interface ConfirmationCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes: number;
  /** Where the code was asked for */
  details: SecurityEventDetails;
}

/**
 * Transactional, to the account's address: the code for "Confirm it's you"
 * before a change to the account's security (accounts without two-step
 * verification). Nothing in it changes the account by itself.
 */
export function ConfirmationCodeEmail({
  code,
  expiresInMinutes,
  details,
}: ConfirmationCodeEmailProps) {
  const expiry = `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;
  return (
    <EmailLayout
      preview={`Enter this code to confirm it's you. It expires in ${expiry}.`}
      reason="You got this email because someone asked to change the security of the QRdx account with this address."
    >
      <EmailHeading>Confirm it's you</EmailHeading>
      <EmailText>
        Enter this code in QRdx to confirm it's you before a change to your
        account's security:
      </EmailText>
      <EmailCodeBox code={code} />
      <EmailText>
        The code expires in {expiry} and works once. Don't share it with anyone.
      </EmailText>
      <NeverAskForCode />
      <SecurityDetails details={details} />
      <ReviewSecurityButton />
      <EmailDivider />
      <MutedText>
        If you didn't ask for this, don't enter the code: someone may be signed
        in to your account. Review your security and contact support at{" "}
        <SupportLink /> from this address.
      </MutedText>
    </EmailLayout>
  );
}
