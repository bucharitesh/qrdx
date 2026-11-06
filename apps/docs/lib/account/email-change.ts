/**
 * Settings → Account → Email: moving an account to a new address. Pure and
 * client-safe; the server actions are app/settings/account/_lib/
 * email-change-actions.ts.
 *
 * 1. The user enters the new address and Better Auth's emailOTP plugin
 *    (`change-email` type) emails a 6-digit code to it.
 * 2. They enter the code and the change takes effect. The old address gets a
 *    notice, with no link that undoes it.
 *
 * Both steps need a recent "Confirm it's you" (./confirmation-server.tsx), so
 * an old stolen cookie can't move the account. An address that already
 * belongs to another account never gets a code: Better Auth answers as if it
 * sent one, so the form doesn't reveal which addresses have accounts, and
 * the confirming step checks again.
 */

/**
 * Signed in this recently (Better Auth's own "fresh session" age). Workspace
 * SSO changes (ee/sso/connections.ts) still use this rule.
 */
export const EMAIL_CHANGE_RECENT_SIGN_IN_MS = 24 * 60 * 60 * 1000;

export function canChangeEmailNow(sessionCreatedAt: Date, now: Date): boolean {
  return (
    now.getTime() - sessionCreatedAt.getTime() <= EMAIL_CHANGE_RECENT_SIGN_IN_MS
  );
}

/** RFC 5321's limit on an address. */
export const MAX_EMAIL_LENGTH = 254;

/** Addresses are compared (and stored by Better Auth) in lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSameEmail(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

export const EMAIL_CHANGE_MESSAGES = {
  reauth:
    "For your security, sign out and sign in again, then change your email within a day.",
  sameEmail: "That's already your email.",
  invalidEmail: "Enter a valid email address.",
  invalidCode: "Enter the 6-digit code from the email.",
  rateLimited: "Too many tries. Wait a few minutes and try again.",
  codeRateLimited:
    "Too many codes sent to that address. Wait a few minutes and try again.",
  notSent: "We couldn't send a code right now. Please try again.",
  wrongCode: "That code isn't right. Check the email and try again.",
  expired: "That code has expired. Send a new one.",
  tooManyAttempts: "Too many wrong tries. Send a new code.",
  taken: "That email already belongs to another QRdx account.",
  signedOut: "Sign in to change your email.",
  failed: "Something went wrong. Please try again.",
} as const;

/** What a Better Auth APIError carries (auth.api throws these). */
interface AuthErrorLike {
  statusCode?: number;
  body?: { code?: string; message?: string };
}

const authError = (error: unknown): AuthErrorLike =>
  error && typeof error === "object" ? (error as AuthErrorLike) : {};

/** Requesting the code: a message for a known failure, else null. */
export function requestFailureMessage(error: unknown): string | null {
  const { statusCode, body } = authError(error);
  if (statusCode === 429) return EMAIL_CHANGE_MESSAGES.codeRateLimited;
  switch (body?.code) {
    case "EMAIL_CHANGE_CODE_NOT_SENT":
      return EMAIL_CHANGE_MESSAGES.notSent;
    case "INVALID_EMAIL":
      return EMAIL_CHANGE_MESSAGES.invalidEmail;
    case "UNAUTHORIZED":
      return EMAIL_CHANGE_MESSAGES.signedOut;
  }
  if (body?.message === "Email is the same") {
    return EMAIL_CHANGE_MESSAGES.sameEmail;
  }
  return null;
}

/**
 * Confirming with the code: a message for a known failure, and whether the
 * code is used up (send a new one), else null.
 */
export function confirmFailure(
  error: unknown,
): { message: string; codeDead: boolean } | null {
  const { statusCode, body } = authError(error);
  if (statusCode === 429) {
    return { message: EMAIL_CHANGE_MESSAGES.rateLimited, codeDead: false };
  }
  switch (body?.code) {
    case "INVALID_OTP":
      return { message: EMAIL_CHANGE_MESSAGES.wrongCode, codeDead: false };
    case "OTP_EXPIRED":
      return { message: EMAIL_CHANGE_MESSAGES.expired, codeDead: true };
    case "TOO_MANY_ATTEMPTS":
      return { message: EMAIL_CHANGE_MESSAGES.tooManyAttempts, codeDead: true };
    case "INVALID_EMAIL":
      return { message: EMAIL_CHANGE_MESSAGES.invalidEmail, codeDead: true };
    case "UNAUTHORIZED":
      return { message: EMAIL_CHANGE_MESSAGES.signedOut, codeDead: true };
  }
  // Only reachable with a valid code, so saying so leaks nothing.
  if (body?.message === "Email already in use") {
    return { message: EMAIL_CHANGE_MESSAGES.taken, codeDead: true };
  }
  if (body?.message === "Email is the same") {
    return { message: EMAIL_CHANGE_MESSAGES.sameEmail, codeDead: true };
  }
  return null;
}

export interface NoticeDeliveryDeps {
  nodeEnv: string | undefined;
  /** isOutboundDeliveryAllowed() */
  deliveryAllowed: boolean;
  /** Emails the notice; resolves `{ sent: false }` when it wasn't sent */
  send: () => Promise<{ sent: boolean; reason?: string }>;
  /** Server console */
  log: (line: string) => void;
}

/**
 * The "your email was changed" notice to the old address, after the change
 * (the same delivery rules as codes: emailed where outbound delivery is on,
 * written to the console in local dev). Never throws: the change has already
 * happened, so a failed notice is reported, not undone.
 */
export async function deliverEmailChangedNotice(
  { previousEmail, newEmail }: { previousEmail: string; newEmail: string },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx email-change notice for ${previousEmail}: "Your QRdx email was changed to ${newEmail}" (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
