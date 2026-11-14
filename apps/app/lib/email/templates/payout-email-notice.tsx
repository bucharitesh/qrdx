import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  SecurityDetails,
  type SecurityEventDetails,
  SupportLink,
} from "./security-parts";

export const PAYOUT_EMAIL_NOTICE_SUBJECT =
  "Your QRdx affiliate payouts now go to a new PayPal address";

export interface PayoutEmailNoticeProps {
  /** The PayPal address payouts go to from now on */
  paypalEmail: string;
  /** Whether there was an address before (a change, not the first one) */
  replaced: boolean;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
}

/**
 * Transactional security notice after the affiliate payout address is set
 * or changed (Settings → Affiliate program), with where and when it
 * happened. Whoever controls that address receives the affiliate's money,
 * so the account holder hears about every change. Nothing in it changes the
 * account.
 */
export function PayoutEmailNoticeEmail({
  paypalEmail,
  replaced,
  details,
}: PayoutEmailNoticeProps) {
  return (
    <EmailLayout
      preview={`Affiliate payouts from QRdx will be sent to ${paypalEmail}.`}
      reason="You got this email because it's the address of a QRdx account in the affiliate program, and we tell you about every change to where its payouts go."
    >
      <EmailHeading>{PAYOUT_EMAIL_NOTICE_SUBJECT}</EmailHeading>
      <EmailText>
        {replaced
          ? "The PayPal address for your affiliate payouts was changed. "
          : "A PayPal address for your affiliate payouts was added. "}
        From now on we send your payouts to <strong>{paypalEmail}</strong>.
      </EmailText>
      <SecurityDetails details={details} />
      <EmailText>If this was you, there's nothing else to do.</EmailText>
      <EmailDivider />
      <MutedText>
        If this wasn't you, sign in, change the address back in Settings →
        Affiliate program, and contact support at <SupportLink /> from this
        address before the next payout.
      </MutedText>
    </EmailLayout>
  );
}
