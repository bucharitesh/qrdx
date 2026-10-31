import "server-only";

import type { SignInCodeSender } from "@repo/auth/email-otp";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  SIGN_IN_CODE_SUBJECT,
  SignInCodeEmail,
} from "@/lib/email/templates/sign-in-code";
import { deliverSignInCode } from "./sign-in-code-delivery";

/** Registered with @repo/auth in app/api/auth/[...all]/route.ts. */
export const sendSignInCode: SignInCodeSender = async ({ email, otp }) => {
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
