import type { NoticeDeliveryDeps } from "./email-change";
import { describeUserAgent } from "./sessions";

/**
 * Settings → Profile & security → Passkeys: what the page shows for each
 * passkey, and the messages for adding, renaming and removing one. Pure and
 * client-safe; the server actions are app/settings/account/_lib/
 * passkey-actions.ts. Better Auth's passkey plugin stores the rows
 * (packages/auth/passkey.ts has QRdx's rules).
 */

/** The columns the page reads; keys and counters never leave the server. */
export interface PasskeyRow {
  id: string;
  name: string | null;
  createdAt: Date | null;
  deviceType: string;
  backedUp: boolean;
  aaguid: string | null;
}

export interface PasskeyView {
  id: string;
  name: string;
  /** "Added Nov 5, 2026" (empty when the date is unknown) */
  added: string;
  /** Saved to a password manager or cloud keychain, so on every device signed in to it */
  synced: boolean;
  /** "Google Password Manager", when the authenticator says which it is */
  provider: string | null;
}

export const MAX_PASSKEY_NAME_LENGTH = 64;
const FALLBACK_NAME = "Passkey";

/** "Chrome on macOS", like the Sessions list; "Passkey" when unknown. */
export function defaultPasskeyName(userAgent: string | null): string {
  const { label } = describeUserAgent(userAgent);
  return label === "Unknown device" ? FALLBACK_NAME : label;
}

/** Trimmed, single-spaced and at most 64 characters; null when empty. */
export function normalizePasskeyName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, MAX_PASSKEY_NAME_LENGTH).trim();
}

/** Newest first, named, with the kind the person can recognise. */
export function toPasskeyViews(
  rows: PasskeyRow[],
  {
    formatDate,
    providerName = () => undefined,
  }: {
    formatDate: (date: Date) => string;
    providerName?: (aaguid: string | null) => string | undefined;
  },
): PasskeyView[] {
  return [...rows]
    .sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    )
    .map((row) => {
      const provider = providerName(row.aaguid) ?? null;
      return {
        id: row.id,
        name: normalizePasskeyName(row.name) ?? provider ?? FALLBACK_NAME,
        added: row.createdAt ? `Added ${formatDate(row.createdAt)}` : "",
        synced: row.backedUp,
        provider,
      };
    });
}

export const PASSKEY_MESSAGES = {
  reauth:
    "For your security, sign out and sign in again, then add your passkey within a day.",
  signedOut: "Sign in to manage your passkeys.",
  invalidName: "Give the passkey a name.",
  notFound: "That passkey is already gone. Refresh the page.",
  cancelled: "Adding the passkey was cancelled.",
  alreadyAdded:
    "This device or password manager already has a passkey for your account.",
  noUserVerification:
    "That passkey didn't ask for your PIN, fingerprint or face, so it can't be used with QRdx. Try another device or password manager.",
  expired: "That took too long. Try adding the passkey again.",
  notSupported: "This browser can't create passkeys.",
  rateLimited: "Too many tries. Wait a few minutes and try again.",
  failed: "Something went wrong. Please try again.",
} as const;

/** What a Better Auth APIError carries (auth.api throws these). */
interface AuthErrorLike {
  statusCode?: number;
  body?: { code?: string; message?: string };
}

/**
 * Adding a passkey on the server failed: a message for a known reason (and
 * whether a fresh sign-in is needed), else null.
 */
export function registrationFailure(
  error: unknown,
): { message: string; reauth: boolean } | null {
  const { body } =
    error && typeof error === "object" ? (error as AuthErrorLike) : {};
  switch (body?.code) {
    case "SESSION_NOT_FRESH":
      return { message: PASSKEY_MESSAGES.reauth, reauth: true };
    case "UNAUTHORIZED":
    case "SESSION_REQUIRED":
      return { message: PASSKEY_MESSAGES.signedOut, reauth: false };
    case "CHALLENGE_NOT_FOUND":
      return { message: PASSKEY_MESSAGES.expired, reauth: false };
    case "PASSKEY_USER_VERIFICATION_REQUIRED":
      return { message: PASSKEY_MESSAGES.noUserVerification, reauth: false };
  }
  return null;
}

/**
 * The browser step failed (@simplewebauthn/browser's WebAuthnError codes,
 * passed through by the plugin's client): a message for the person.
 */
export function browserFailureMessage(code: string | undefined): string {
  switch (code) {
    case "ERROR_CEREMONY_ABORTED":
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
      return PASSKEY_MESSAGES.cancelled;
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return PASSKEY_MESSAGES.alreadyAdded;
    case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
    case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
      return PASSKEY_MESSAGES.noUserVerification;
    default:
      return PASSKEY_MESSAGES.failed;
  }
}

/** Signing in with a passkey failed: the line under the button. */
export function signInFailureMessage(error: {
  code?: string;
  status?: number;
}): string | null {
  if (error.status === 429) {
    return "Too many tries. Wait a minute, then try again.";
  }
  switch (error.code) {
    // Closed the browser's prompt, or picked nothing: say nothing.
    case "AUTH_CANCELLED":
    case "ERROR_CEREMONY_ABORTED":
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
      return null;
    case "PASSKEY_USER_VERIFICATION_REQUIRED":
      return "That passkey didn't ask for your PIN, fingerprint or face. Use one that does, or sign in another way.";
    case "PASSKEY_NOT_FOUND":
      return "That passkey isn't linked to a QRdx account anymore. Sign in another way.";
    case "BANNED_USER":
      return "This account is suspended. Contact support if you think that's a mistake.";
    // The account's address is at a domain whose company requires SSO.
    case "sso_required":
      return "Your company requires single sign-on for this account. Sign in with SSO.";
    default:
      return "That passkey didn't work. Try again, or sign in another way.";
  }
}

/**
 * The "a passkey was added/removed" notice (the same delivery rules as the
 * email-change notice: emailed where outbound delivery is on, written to the
 * console in local dev). Never throws: the change already happened, so a
 * failed notice is reported, not undone.
 */
export async function deliverPasskeyNotice(
  { email, subject }: { email: string; subject: string },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx security notice for ${email}: "${subject}" (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
