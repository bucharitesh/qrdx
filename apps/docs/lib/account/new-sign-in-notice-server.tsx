import "server-only";

import type { NewSignIn, NewSignInNotifier } from "@repo/auth/new-sign-in";
import { after } from "next/server";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  NEW_SIGN_IN_SUBJECT,
  NewSignInEmail,
} from "@/lib/email/templates/new-sign-in";
import { requestDetails } from "@/lib/security/request-details";
import {
  deliverNewSignInNotice,
  signInMethodLabel,
} from "./new-sign-in-notice";

async function sendNewSignInAlert({
  user,
  method,
  secondStep,
  headers,
}: NewSignIn): Promise<void> {
  const details = requestDetails(headers);
  const methodLabel = signInMethodLabel(method, secondStep);
  const summary = [
    details.device,
    details.location,
    details.ip,
    details.time,
    methodLabel,
  ]
    .filter(Boolean)
    .join(", ");
  const outcome = await deliverNewSignInNotice(
    { email: user.email, summary },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: user.email,
          subject: NEW_SIGN_IN_SUBJECT,
          react: <NewSignInEmail details={details} method={methodLabel} />,
          tags: [{ name: "category", value: "new_sign_in" }],
        }),
    },
  );
  // No addresses or ids in the log.
  const level = outcome === "not-sent" ? "error" : "info";
  console[level](
    JSON.stringify({ event: "account.new_sign_in_alert", outcome }),
  );
}

/**
 * Registered with @repo/auth in app/api/auth/[...all]/route.ts. Sends after
 * the response, so the alert never slows a sign-in down; outside a request
 * (no `after`), it sends straight away.
 */
export const notifyNewSignIn: NewSignInNotifier = (signIn) => {
  try {
    after(() => sendNewSignInAlert(signIn));
  } catch {
    return sendNewSignInAlert(signIn);
  }
};
