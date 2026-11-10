import "server-only";

import { deliverPasskeyNotice as deliverSecurityNotice } from "@/lib/account/passkeys";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  PAYOUT_EMAIL_NOTICE_SUBJECT,
  PayoutEmailNoticeEmail,
} from "@/lib/email/templates/payout-email-notice";
import { currentRequestDetails } from "@/lib/security/request-details";

/**
 * Tells the account's address that its affiliate payouts now go to another
 * PayPal address, with the device, place and time of the request, like the
 * two-step verification and passkey notices. Runs after the change (best
 * effort, never throws); a notice that couldn't be sent is logged as a
 * warning. No addresses or ids in the log.
 */
export async function sendPayoutEmailNotice({
  email,
  paypalEmail,
  replaced,
}: {
  /** The QRdx account's address, where the notice goes */
  email: string;
  paypalEmail: string;
  replaced: boolean;
}): Promise<void> {
  try {
    const details = await currentRequestDetails();
    const notice = await deliverSecurityNotice(
      { email, subject: PAYOUT_EMAIL_NOTICE_SUBJECT },
      {
        nodeEnv: process.env.NODE_ENV,
        deliveryAllowed: isOutboundDeliveryAllowed(),
        log: (line) => console.info(line),
        send: () =>
          sendEmail({
            to: email,
            subject: PAYOUT_EMAIL_NOTICE_SUBJECT,
            react: (
              <PayoutEmailNoticeEmail
                details={details}
                paypalEmail={paypalEmail}
                replaced={replaced}
              />
            ),
            tags: [{ name: "category", value: "affiliate_payout_email" }],
          }),
      },
    );
    const level = notice === "not-sent" ? "warn" : "info";
    console[level](
      JSON.stringify({ event: "affiliates.payout_email_changed", notice }),
    );
  } catch {
    console.warn(
      JSON.stringify({
        event: "affiliates.payout_email_changed",
        notice: "not-sent",
      }),
    );
  }
}
