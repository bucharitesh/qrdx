import "server-only";

import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  TwoFactorNoticeEmail,
  twoFactorNoticeSubject,
} from "@/lib/email/templates/two-factor-notice";
import { currentRequestDetails } from "@/lib/security/request-details";
import {
  deliverTwoFactorNotice,
  type TwoFactorNoticeKind,
} from "./two-factor-notice";

/**
 * Tells the account's address about a two-step verification change, with the
 * device, place and time of the request that made it (read here, so callers
 * don't pass them). Best effort and never throws; a notice that wasn't sent
 * is logged loudly (no address in the log).
 */
export async function sendTwoFactorNotice(
  kind: TwoFactorNoticeKind,
  email: string,
): Promise<void> {
  const request = await currentRequestDetails();
  // Support's change: their device and address aren't the account's business.
  const details =
    kind === "support-off" ? { ...request, actor: "QRdx support" } : request;
  const outcome = await deliverTwoFactorNotice(
    { kind, email },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: email,
          subject: twoFactorNoticeSubject(kind),
          react: <TwoFactorNoticeEmail details={details} kind={kind} />,
          tags: [{ name: "category", value: "two_factor" }],
        }),
    },
  );
  const level = outcome === "not-sent" ? "error" : "info";
  console[level](
    JSON.stringify({ event: "account.two_factor_notice", kind, outcome }),
  );
}
