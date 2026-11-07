import "server-only";

import {
  type SignInCodeSender,
  signInCodeRateLimited,
} from "@repo/auth/email-otp";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  SIGN_IN_CODE_SUBJECT,
  SignInCodeEmail,
} from "@/lib/email/templates/sign-in-code";
import { currentRequestDetails } from "@/lib/security/request-details";
import {
  addressKey,
  addressMayRequestCode,
  deliverSignInCode,
} from "./sign-in-code-delivery";

// Per address, shared across server instances (Upstash). Better Auth's own
// per-IP limit is in memory per instance, so these are what stop one inbox
// being flooded with codes and bound guessing over a day (3 tries per code).
// Fail open when Upstash isn't configured.
const perAddressLimiter = createRateLimiter({
  prefix: "qrdx:sign-in-code",
  limiter: slidingWindow(5, "15 m"),
});
const perAddressDailyLimiter = createRateLimiter({
  prefix: "qrdx:sign-in-code-day",
  limiter: slidingWindow(30, "1 d"),
});

/**
 * Registered with @repo/auth in app/api/auth/[...all]/route.ts. The email
 * says roughly where the code was asked for, from the request's geo headers.
 */
export const sendSignInCode: SignInCodeSender = async ({ email, otp }) => {
  const allowed = await addressMayRequestCode(addressKey(email), [
    perAddressLimiter,
    perAddressDailyLimiter,
  ]);
  if (!allowed) throw signInCodeRateLimited();
  const { location } = await currentRequestDetails();
  await deliverSignInCode(
    { email, otp },
    {
      nodeEnv: process.env.NODE_ENV,
      deliveryAllowed: isOutboundDeliveryAllowed(),
      log: (line) => console.info(line),
      send: () =>
        sendEmail({
          to: email,
          subject: SIGN_IN_CODE_SUBJECT,
          react: <SignInCodeEmail code={otp} location={location} />,
          tags: [{ name: "category", value: "sign_in_code" }],
        }),
    },
  );
};
