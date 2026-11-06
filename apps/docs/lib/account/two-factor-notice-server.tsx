import "server-only";

import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  TwoFactorNoticeEmail,
  twoFactorNoticeSubject,
} from "@/lib/email/templates/two-factor-notice";
import {
  deliverTwoFactorNotice,
  type TwoFactorNoticeKind,
} from "./two-factor-notice";

/**
 * Tells the account's address about a two-step verification change. Best
 * effort and never throws; a notice that wasn't sent is logged loudly (no
 * address in the log).
 */
export async function sendTwoFactorNotice(
  kind: TwoFactorNoticeKind,
  email: string,
): Promise<void> {
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
          react: <TwoFactorNoticeEmail kind={kind} />,
          tags: [{ name: "category", value: "two_factor" }],
        }),
    },
  );
  const level = outcome === "not-sent" ? "error" : "info";
  console[level](
    JSON.stringify({ event: "account.two_factor_notice", kind, outcome }),
  );
}
