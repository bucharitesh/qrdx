import "server-only";

import { createHash } from "node:crypto";
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
import {
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

/** Registered with @repo/auth in app/api/auth/[...all]/route.ts. */
export const sendSignInCode: SignInCodeSender = async ({ email, otp }) => {
  // Hashed, so addresses never sit in Redis keys.
  const key = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  const allowed = await addressMayRequestCode(key, [
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
          subject: SIGN_IN_CODE_SUBJECT,
          react: <SignInCodeEmail code={otp} />,
          tags: [{ name: "category", value: "sign_in_code" }],
        }),
    },
  );
};
