// Two-step verification at sign-in: the pure parts, shared by the hook
// (./sign-in-challenge.ts), the app and tests. No imports.
//
// The rule: once someone turns on two-step verification, every sign-in asks
// for a second step (a passkey, an authenticator code or a backup code)
// before a session exists. The one exception is a passkey sign-in where the
// authenticator verified the person (PIN or biometrics), which is already
// two factors.

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
/**
 * Wrong codes allowed per challenge (fixed in the plugin). A passkey that
 * fails to verify counts as one too.
 */
export const CHALLENGE_ATTEMPTS = 5;
/**
 * Consecutive wrong codes (or failed passkeys), across challenges, before
 * the account locks.
 */
export const LOCKOUT_FAILURES = 10;
export const LOCKOUT_MINUTES = 15;

/** A passkey as the second step (./sign-in-challenge-passkey.ts). */
export const PASSKEY_STEP_OPTIONS_PATH = "/two-factor/passkey/options";
export const PASSKEY_STEP_VERIFY_PATH = "/two-factor/passkey/verify";
/** Which second steps the person signing in has set up. */
export const TWO_FACTOR_METHODS_PATH = "/two-factor/methods";
/** A passkey second step's WebAuthn challenge lasts this long, once. */
export const PASSKEY_STEP_SECONDS = 5 * 60;

/**
 * Endpoints that check a code or a passkey to finish a challenge. Over HTTP
 * they only work for a pending challenge, never with a session
 * (./sign-in-challenge.ts).
 */
export const CHALLENGE_CODE_PATHS: readonly string[] = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  PASSKEY_STEP_VERIFY_PATH,
];

/**
 * Steps on the way to finishing a challenge: they need a pending challenge
 * (the two_factor cookie) and never create a session.
 */
export const CHALLENGE_STEP_PATHS: readonly string[] = [
  TWO_FACTOR_METHODS_PATH,
  PASSKEY_STEP_OPTIONS_PATH,
];

/** What GET /two-factor/methods answers for the person signing in. */
export interface TwoFactorMethods {
  /** At least one passkey, on a deployment where passkeys work. */
  passkey: boolean;
  /** An authenticator app, confirmed with a first code. */
  totp: boolean;
  /** Backup codes left to use. */
  backupCodes: boolean;
}

/**
 * Whether a twoFactor row holds an authenticator app that can answer a
 * code: a secret, confirmed with a first code (`verified` is false between
 * setup and that code). A row without one (an account whose second step is
 * a passkey) never accepts an authenticator code at sign-in.
 */
export function totpIsSetUp(
  row: { secret?: unknown; verified?: boolean | null } | null | undefined
): boolean {
  return Boolean(
    row &&
      row.verified !== false &&
      typeof row.secret === "string" &&
      row.secret.length > 0
  );
}

/**
 * Finishes a challenge on a trusted device, by GET. A SAML sign-in ends in a
 * cross-site POST from the identity provider, which doesn't carry the
 * SameSite=Lax trust-device cookie; the challenge sends that browser here
 * (a top-level GET, which does carry it) instead of straight to the page.
 */
export const CHALLENGE_CONTINUE_PATH = "/two-factor/continue";

/**
 * Endpoints that finish a challenge: they create the session the challenge
 * was for, so they are never challenged themselves.
 */
export const CHALLENGE_COMPLETION_PATHS: readonly string[] = [
  ...CHALLENGE_CODE_PATHS,
  CHALLENGE_CONTINUE_PATH,
];

/**
 * The app's own 2FA management calls (auth.api from Settings, after its own
 * checks: the person confirmed it's you, apps/app/lib/account/
 * confirmation-server.tsx) that can make a new session
 * for someone with 2FA on. Called server-side, these aren't challenged. Any
 * other server-side call that makes a session is: a server action that
 * signs someone in gets no way around the code.
 */
export const SERVER_SESSION_SWAP_PATHS: readonly string[] = [
  "/two-factor/enable",
  "/two-factor/disable",
];

/** Codes by email or SMS as a second factor: off (no `otpOptions`). */
export const UNUSED_TWO_FACTOR_PATHS: readonly string[] = [
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
];

/**
 * Off over HTTP; only the app's server actions call them, through auth.api,
 * after the person confirms it's you (Settings → Profile & security).
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

/** Where a session-creating POST that ends in a redirect continues (GET). */
export function challengeContinueUrl(authBaseUrl: string, next: string | null) {
  const url = new URL(
    `${authBaseUrl.replace(/\/$/, "")}${CHALLENGE_CONTINUE_PATH}`
  );
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

/** Where the continue endpoint lands without a usable `next`. */
export const CONTINUE_DEFAULT_PATH = "/dashboard";

/**
 * The continue endpoint's `next` as a path on this site, or null: only a
 * relative path ("/dashboard/acme?x=1"), never another origin, "//host",
 * backslashes, whitespace or control characters (like lib/safe-redirect).
 */
export function continueNextPath(
  value: unknown,
  appOrigin: string
): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\s]/.test(value)) return null;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  const path = challengeReturnPath(value, appOrigin);
  return path?.startsWith("/") && !path.startsWith("//") ? path : null;
}
