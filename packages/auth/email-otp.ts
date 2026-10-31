import { APIError } from "better-auth/api";
import type { EmailOTPOptions } from "better-auth/plugins";

/**
 * Email sign-in codes. This package has no email stack, so the app registers
 * how a code reaches the inbox (apps/docs registers it in its /api/auth route).
 * Only sign-in codes are delivered: email verification, password reset and
 * email change are not used, their endpoints are disabled in ./server.ts.
 */

/** Delivers one sign-in code. Throw when it couldn't be sent. */
export type SignInCodeSender = (data: {
  email: string;
  otp: string;
}) => Promise<void>;

// Kept on globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the sender the app registered.
const SENDER = Symbol.for("@repo/auth/sign-in-code-sender");
interface SenderSlot {
  [SENDER]?: SignInCodeSender;
}

export function registerSignInCodeSender(sender: SignInCodeSender): void {
  (globalThis as SenderSlot)[SENDER] = sender;
}

/** Error code the sign-in dialog shows as "couldn't send the code". */
export const SIGN_IN_CODE_NOT_SENT = "SIGN_IN_CODE_NOT_SENT";

function notSent(): APIError {
  return new APIError("INTERNAL_SERVER_ERROR", {
    code: SIGN_IN_CODE_NOT_SENT,
    message: "We couldn't send a sign-in code right now.",
  });
}

// Codes and addresses never go into these logs.
function log(level: "warn" | "error", event: string, fields = {}) {
  console[level](JSON.stringify({ event, ...fields }));
}

/** The emailOTP plugin's `sendVerificationOTP`. */
export const sendVerificationOTP: EmailOTPOptions["sendVerificationOTP"] =
  async ({ email, otp, type }) => {
    if (type !== "sign-in") {
      log("warn", "auth.email_otp.ignored", { type });
      return;
    }
    const sender = (globalThis as SenderSlot)[SENDER];
    if (!sender) {
      log("error", "auth.email_otp.no_sender");
      throw notSent();
    }
    try {
      await sender({ email, otp });
    } catch (error) {
      log("error", "auth.email_otp.failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw notSent();
    }
  };
