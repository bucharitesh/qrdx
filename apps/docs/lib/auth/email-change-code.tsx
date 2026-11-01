import "server-only";

import {
  type EmailChangeCodeSender,
  signInCodeRateLimited,
} from "@repo/auth/email-otp";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  EMAIL_CHANGE_CODE_SUBJECT,
  EmailChangeCodeEmail,
} from "@/lib/email/templates/email-change";
import {
  addressKey,
  addressMayRequestCode,
  deliverSignInCode,
} from "./sign-in-code-delivery";

// The same per-address limits as sign-in codes (./sign-in-code.tsx), on their
// own counters: 5 per 15 minutes and 30 a day for each new address, shared
// across instances through Upstash. Fail open when Upstash isn't configured.
// The server actions also limit each user (_lib/email-change-actions.ts).
const perAddressLimiter = createRateLimiter({
  prefix: "qrdx:email-change-code",
  limiter: slidingWindow(5, "15 m"),
});
const perAddressDailyLimiter = createRateLimiter({
  prefix: "qrdx:email-change-code-day",
  limiter: slidingWindow(30, "1 d"),
});

/**
 * Emails the code that confirms a new address, to that address. In local dev
 * it is printed to the server log instead (like sign-in codes). Registered
 * with @repo/auth by app/settings/account/_lib/email-change-actions.ts.
 */
export const sendEmailChangeCode: EmailChangeCodeSender = async ({
  email,
  otp,
}) => {
  const allowed = await addressMayRequestCode(addressKey(email), [
    perAddressLimiter,
    perAddressDailyLimiter,
  ]);
  if (!allowed) throw signInCodeRateLimited();
  await deliverSignInCode(
    { email, otp },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: email,
          subject: EMAIL_CHANGE_CODE_SUBJECT,
          react: <EmailChangeCodeEmail code={otp} />,
          tags: [{ name: "category", value: "email_change_code" }],
        }),
    },
    "email-change code",
  );
};
