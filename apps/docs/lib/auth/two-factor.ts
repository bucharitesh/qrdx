/**
 * Two-step verification: the client-safe parts. The sign-in challenge
 * (app/(app)/(auth)/components/two-factor-challenge.tsx) and Settings → Profile &
 * security (two-factor-section.tsx, _lib/two-factor-actions.ts) share these.
 * The rules themselves live in @repo/auth/sign-in-challenge-rules.
 */
import {
  BACKUP_CODE_COUNT,
  CHALLENGE_ATTEMPTS,
  LOCKOUT_MINUTES,
  normalizeBackupCode,
  TRUST_DEVICE_DAYS,
} from "@repo/auth/sign-in-challenge-rules";

export {
  BACKUP_CODE_COUNT,
  CHALLENGE_ATTEMPTS,
  normalizeBackupCode,
  TRUST_DEVICE_DAYS,
};

export const TWO_FACTOR_MESSAGES = {
  wrongCode:
    "That code isn't right. Check your authenticator app and try again.",
  wrongBackupCode: "That backup code isn't right, or it was already used.",
  invalidCode: "Enter the 6-digit code from your authenticator app.",
  invalidBackupCode:
    "That isn't a backup code. They look like ABCDE-FGH23: capital letters and the digits 2 to 9.",
  tooManyAttempts: "Too many wrong codes. Sign in again to try again.",
  locked: `Too many wrong codes in a row. Try again in ${LOCKOUT_MINUTES} minutes.`,
  expired: "This sign-in timed out. Sign in again.",
  rateLimited: "Too many tries. Wait a moment, then try again.",
  failed: "Something went wrong. Check your connection and try again.",
} as const;

export type ChallengeMode = "totp" | "backup";

/** What Better Auth's client returns as `error`. */
export interface AuthClientError {
  code?: string;
  status?: number;
}

/**
 * A failed challenge answer: the message, and whether this challenge is over
 * (sign in again).
 */
export function challengeFailure(
  error: AuthClientError,
  mode: ChallengeMode,
): { message: string; over: boolean } {
  switch (error.code) {
    case "INVALID_CODE":
      return { message: TWO_FACTOR_MESSAGES.wrongCode, over: false };
    case "INVALID_BACKUP_CODE":
      return { message: TWO_FACTOR_MESSAGES.wrongBackupCode, over: false };
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return { message: TWO_FACTOR_MESSAGES.tooManyAttempts, over: true };
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return { message: TWO_FACTOR_MESSAGES.locked, over: true };
    case "INVALID_TWO_FACTOR_COOKIE":
      return { message: TWO_FACTOR_MESSAGES.expired, over: true };
    // A sign-in started with an email code just as the workspace began
    // requiring SSO for the address (packages/auth/ee/sso-required.ts).
    case "sso_required":
      return {
        message:
          "Your company now requires single sign-on for this address. Start again and sign in with SSO.",
        over: true,
      };
  }
  if (error.status === 429) {
    return { message: TWO_FACTOR_MESSAGES.rateLimited, over: false };
  }
  if (error.status === 401) {
    return {
      message:
        mode === "backup"
          ? TWO_FACTOR_MESSAGES.wrongBackupCode
          : TWO_FACTOR_MESSAGES.wrongCode,
      over: false,
    };
  }
  return { message: TWO_FACTOR_MESSAGES.failed, over: false };
}

/** A 6-digit authenticator code. */
export const isTotpCode = (code: string) => /^\d{6}$/.test(code);

/**
 * Which kind of second-factor code someone entered: a 6-digit authenticator
 * code, a backup code (any case, dash optional), or neither.
 */
export function secondFactorCodeKind(
  input: string | null | undefined,
): "totp" | "backup" | null {
  const value = (input ?? "").trim();
  if (isTotpCode(value)) return "totp";
  return normalizeBackupCode(value) ? "backup" : null;
}

/** The base32 secret in an otpauth:// URI, or null. */
export function secretFromUri(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "otpauth:") return null;
    return url.searchParams.get("secret");
  } catch {
    return null;
  }
}

/** "ABCD EFGH …": easier to type into an app by hand. */
export function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

/** The downloadable backup codes (.txt). */
export function backupCodesText({
  codes,
  email,
  createdAt,
}: {
  codes: readonly string[];
  email: string;
  createdAt: Date;
}): string {
  const date = createdAt.toISOString().slice(0, 10);
  return [
    "QRdx backup codes",
    `Account: ${email}`,
    `Created: ${date}`,
    "",
    "Each code works once. Use one when you can't use your authenticator app.",
    "Keep them somewhere safe, like a password manager.",
    "",
    ...codes,
    "",
  ].join("\n");
}
