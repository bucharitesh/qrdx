import { APIError } from "better-auth/api";
import type { EmailOTPOptions } from "better-auth/plugins";

/**
 * Email codes. This package has no email stack, so the app registers how a
 * code reaches the inbox:
 * - sign-in codes: apps/app registers the sender in its /api/auth route;
 * - email-change codes (sent to the NEW address): registered by the server
 *   actions that request them (apps/app/app/settings/account/_lib).
 * Email verification and password reset codes are not used; their endpoints
 * are disabled in ./server.ts.
 */

/** Delivers one code. Throw when it couldn't be sent. */
export type SignInCodeSender = (data: {
  email: string;
  otp: string;
}) => Promise<void>;

/** Delivers a code that confirms a new address, to that new address. */
export type EmailChangeCodeSender = SignInCodeSender;

type DeliveredType = "sign-in" | "change-email";

// Kept on globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the senders the app registered.
const SENDERS: Record<DeliveredType, symbol> = {
  "sign-in": Symbol.for("@repo/auth/sign-in-code-sender"),
  "change-email": Symbol.for("@repo/auth/email-change-code-sender"),
};
type SenderSlots = Record<symbol, SignInCodeSender | undefined>;

export function registerSignInCodeSender(sender: SignInCodeSender): void {
  (globalThis as unknown as SenderSlots)[SENDERS["sign-in"]] = sender;
}

export function registerEmailChangeCodeSender(
  sender: EmailChangeCodeSender
): void {
  (globalThis as unknown as SenderSlots)[SENDERS["change-email"]] = sender;
}

/** Error code the sign-in dialog shows as "couldn't send the code". */
export const SIGN_IN_CODE_NOT_SENT = "SIGN_IN_CODE_NOT_SENT";
/** Same, for the code that confirms a new email address. */
export const EMAIL_CHANGE_CODE_NOT_SENT = "EMAIL_CHANGE_CODE_NOT_SENT";

const ERRORS: Record<
  DeliveredType,
  { notSent: string; notSentMessage: string; rateLimited: string }
> = {
  "sign-in": {
    notSent: SIGN_IN_CODE_NOT_SENT,
    notSentMessage: "We couldn't send a sign-in code right now.",
    rateLimited: "SIGN_IN_CODE_RATE_LIMITED",
  },
  "change-email": {
    notSent: EMAIL_CHANGE_CODE_NOT_SENT,
    notSentMessage: "We couldn't send a confirmation code right now.",
    rateLimited: "EMAIL_CHANGE_CODE_RATE_LIMITED",
  },
};

const RATE_LIMITED = "SignInCodeRateLimited";

/**
 * Throw this from a sender (sign-in or email-change) when the address has
 * asked for too many codes: the request then fails with 429 ("too many
 * requests") instead of "couldn't send". Matched by name, so any copy of
 * this module works.
 */
export function signInCodeRateLimited(): Error {
  const error = new Error("Too many codes requested for this address");
  error.name = RATE_LIMITED;
  return error;
}

function notSent(type: DeliveredType): APIError {
  return new APIError("INTERNAL_SERVER_ERROR", {
    code: ERRORS[type].notSent,
    message: ERRORS[type].notSentMessage,
  });
}

// Codes and addresses never go into these logs.
function log(level: "warn" | "error", event: string, fields = {}) {
  console[level](JSON.stringify({ event, ...fields }));
}

/** The emailOTP plugin's `sendVerificationOTP`. */
export const sendVerificationOTP: EmailOTPOptions["sendVerificationOTP"] =
  async ({ email, otp, type }) => {
    if (type !== "sign-in" && type !== "change-email") {
      log("warn", "auth.email_otp.ignored", { type });
      return;
    }
    const sender = (globalThis as unknown as SenderSlots)[SENDERS[type]];
    if (!sender) {
      log("error", "auth.email_otp.no_sender", { type });
      throw notSent(type);
    }
    try {
      await sender({ email, otp });
    } catch (error) {
      if (error instanceof Error && error.name === RATE_LIMITED) {
        log("warn", "auth.email_otp.rate_limited", { type });
        throw new APIError("TOO_MANY_REQUESTS", {
          code: ERRORS[type].rateLimited,
          message: "Too many codes requested. Try again in a few minutes.",
        });
      }
      log("error", "auth.email_otp.failed", {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw notSent(type);
    }
  };
