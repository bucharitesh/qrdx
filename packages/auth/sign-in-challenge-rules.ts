// Two-step verification at sign-in: the pure parts, shared by the hook
// (./sign-in-challenge.ts), the app and tests. No imports.
//
// The rule: once someone turns on two-step verification, every sign-in asks
// for an authenticator or backup code before a session exists. The one
// exception is a passkey sign-in where the authenticator verified the person
// (PIN or biometrics), which is already two factors.

/** Where a challenged sign-in that ends in a redirect lands. */
export const TWO_FACTOR_CHALLENGE_PATH = "/sign-in/two-factor";

/** Codes from an authenticator app: 6 digits, a new one every 30 s. */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Backup codes made at setup and on every regenerate; each works once. */
export const BACKUP_CODE_COUNT = 10;
/**
 * Backup code characters: capitals and digits without the ones people misread
 * (0 O 1 I, and lowercase l never appears). 32 symbols, so 10 of them carry
 * 50 bits and a random byte maps onto them without bias.
 */
export const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BACKUP_CODE_HALF = 5;
/** "Don't ask again on this device" lasts this long. */
export const TRUST_DEVICE_DAYS = 30;
/** A challenge (the two_factor cookie) expires after this (plugin default). */
export const CHALLENGE_MINUTES = 10;
/** Wrong codes allowed per challenge (fixed in the plugin). */
export const CHALLENGE_ATTEMPTS = 5;
/** Consecutive wrong codes, across challenges, before the account locks. */
export const LOCKOUT_FAILURES = 10;
export const LOCKOUT_MINUTES = 15;

/**
 * Endpoints that finish a challenge: they create the session the challenge
 * was for, so they are never challenged themselves. Over HTTP they only work
 * for a pending challenge, never with a session (./sign-in-challenge.ts).
 */
export const CHALLENGE_COMPLETION_PATHS: readonly string[] = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
];

/** Codes by email or SMS as a second factor: off (no `otpOptions`). */
export const UNUSED_TWO_FACTOR_PATHS: readonly string[] = [
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
];

/**
 * Off over HTTP; only the app's server actions call them, through auth.api,
 * after a recent sign-in or a current code (Settings → Profile & security).
 */
export const SERVER_ONLY_TWO_FACTOR_PATHS: readonly string[] = [
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
  "/two-factor/get-totp-uri",
];

/**
 * New backup codes, "ABCDE-FGH23": the twoFactor plugin's
 * `customBackupCodesGenerate`. The plugin stores them as given and compares
 * an entered code by exact string match, so every entered code goes through
 * normalizeBackupCode first (./sign-in-challenge.ts and the app).
 */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_HALF * 2));
    const chars = Array.from(
      bytes,
      (byte) => BACKUP_CODE_ALPHABET[byte % BACKUP_CODE_ALPHABET.length]
    ).join("");
    return `${chars.slice(0, BACKUP_CODE_HALF)}-${chars.slice(BACKUP_CODE_HALF)}`;
  });
}

/**
 * A backup code in the stored form, from whatever someone typed or pasted:
 * any case, with or without the dash or spaces. Null when it can't be one
 * (wrong length, or a character codes never contain, such as 0 or O).
 */
export function normalizeBackupCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const chars = input.replace(/[\s-]+/g, "").toUpperCase();
  if (chars.length !== BACKUP_CODE_HALF * 2) return null;
  for (const char of chars) {
    if (!BACKUP_CODE_ALPHABET.includes(char)) return null;
  }
  return `${chars.slice(0, BACKUP_CODE_HALF)}-${chars.slice(BACKUP_CODE_HALF)}`;
}

/** Passkey sign-in: exempt only when the authenticator verified the user. */
export const PASSKEY_SIGN_IN_PATH = "/passkey/verify-authentication";

// WebAuthn authenticator data: 32-byte RP ID hash, then one flags byte.
const FLAGS_OFFSET = 32;
const USER_VERIFIED = 0x04;

function base64UrlBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * True when a passkey assertion says the authenticator verified the user
 * (the UV flag in its authenticator data). Only meaningful after the
 * signature over that data was checked, which the passkey plugin does
 * before it creates a session; anything malformed reads as false.
 */
export function passkeyAssertionUserVerified(body: unknown): boolean {
  const authenticatorData = (
    body as { response?: { response?: { authenticatorData?: unknown } } }
  )?.response?.response?.authenticatorData;
  if (typeof authenticatorData !== "string") return false;
  const bytes = base64UrlBytes(authenticatorData);
  if (!bytes || bytes.length <= FLAGS_OFFSET) return false;
  // biome-ignore lint/suspicious/noBitwiseOperators: a flags byte
  return (bytes[FLAGS_OFFSET] & USER_VERIFIED) !== 0;
}

/**
 * Where a redirect sign-in was headed, as a path on this site for the
 * challenge page's `next`, or null. Another origin is dropped. The page still
 * checks the result with lib/safe-redirect before using it.
 */
export function challengeReturnPath(
  location: string | null | undefined,
  appOrigin: string
): string | null {
  if (!location) return null;
  let url: URL;
  try {
    url = new URL(location, appOrigin);
  } catch {
    return null;
  }
  if (url.origin !== appOrigin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The challenge page, returning to `next` afterwards when there is one. */
export function challengePageUrl(appOrigin: string, next: string | null) {
  const url = new URL(TWO_FACTOR_CHALLENGE_PATH, appOrigin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}
