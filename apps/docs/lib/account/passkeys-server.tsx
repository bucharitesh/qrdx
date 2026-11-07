import "server-only";

import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  PASSKEY_NOTICE_SUBJECTS,
  type PasskeyChange,
  PasskeyNoticeEmail,
} from "@/lib/email/templates/passkey-notice";
import { currentRequestDetails } from "@/lib/security/request-details";
import { deliverPasskeyNotice } from "./passkeys";

/**
 * Tells the account's address that a passkey was added or removed, with the
 * device, place and time of the request (read here). Runs after the change
 * (best effort, never throws); a notice that couldn't be sent is logged as a
 * warning. No addresses or ids in the log.
 */
export async function sendPasskeyNotice({
  email,
  change,
  passkeyName,
}: {
  email: string;
  change: PasskeyChange;
  passkeyName: string;
}): Promise<void> {
  const subject = PASSKEY_NOTICE_SUBJECTS[change];
  const details = await currentRequestDetails();
  const notice = await deliverPasskeyNotice(
    { email, subject },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: email,
          subject,
          react: (
            <PasskeyNoticeEmail
              change={change}
              details={details}
              passkeyName={passkeyName}
            />
          ),
          tags: [{ name: "category", value: `passkey_${change}` }],
        }),
    },
  );
  const level = notice === "not-sent" ? "warn" : "info";
  console[level](
    JSON.stringify({ event: `account.passkey_${change}`, notice }),
  );
}
