/**
 * "Confirm it's you": a short check before changes to the account's security
 * (the email, deleting the account, two-step verification and its methods,
 * passkeys, workspace single sign-on). Pure and client-safe; the server side
 * is ./confirmation-server.ts and the dialog components/confirm-identity/.
 *
 * - Two-step verification on: a passkey, a code from the authenticator app
 *   or a backup code. Never an emailed code: getting into the mailbox must
 *   not get around the second step.
 * - Off: a 6-digit code emailed to the account's address. Where this
 *   deployment can't send codes, a sign-in within the last 10 minutes.
 *
 * A confirmation lasts 10 minutes for the session that made it, so several
 * changes in a row ask once. A gated server action answers
 * `{ ok: false, error: "CONFIRMATION_REQUIRED" }` without one; the client's
 * useConfirmation() opens the dialog and tries the action again.
 */

/** How long a confirmation lasts for its session. */
export const CONFIRMATION_MINUTES = 10;
/** An emailed confirmation code lasts this long and allows this many tries. */
export const CONFIRMATION_CODE_MINUTES = 10;
export const CONFIRMATION_CODE_ATTEMPTS = 3;
/** Seconds before "Resend code" works again. */
export const CONFIRMATION_RESEND_SECONDS = 30;

export const CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED";

export interface ConfirmationRequired {
  ok: false;
  error: typeof CONFIRMATION_REQUIRED;
}

export const confirmationRequired = (): ConfirmationRequired => ({
  ok: false,
  error: CONFIRMATION_REQUIRED,
});

/**
 * Whether a server action's result asks for a confirmation: the account
 * actions' `{ ok: false, error }` or the SSO actions'
 * `{ success: false, error: { code } }`.
 */
export function needsConfirmation(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const { ok, success, error } = result as {
    ok?: unknown;
    success?: unknown;
    error?: unknown;
  };
  if (ok === false && error === CONFIRMATION_REQUIRED) return true;
  return (
    success === false &&
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === CONFIRMATION_REQUIRED
  );
}

/**
 * The ways to confirm. "sign-in-again" is the fallback for accounts without
 * two-step verification on a deployment that can't send codes.
 */
export type ConfirmMethod =
  | "passkey"
  | "totp"
  | "backup"
  | "email"
  | "sign-in-again";

/** The account's methods, preferred first. */
export function confirmationMethodsFor({
  twoFactorOn,
  authenticatorApp,
  passkeys,
  emailCodes,
}: {
  twoFactorOn: boolean;
  /** An authenticator app is set up (not only started) */
  authenticatorApp: boolean;
  /** Passkeys the account has (and this deployment can use) */
  passkeys: number;
  /** This deployment can deliver a code to the account's address */
  emailCodes: boolean;
}): ConfirmMethod[] {
  if (twoFactorOn) {
    const methods: ConfirmMethod[] = [];
    if (passkeys > 0) methods.push("passkey");
    if (authenticatorApp) methods.push("totp");
    methods.push("backup");
    return methods;
  }
  return [emailCodes ? "email" : "sign-in-again"];
}

/** What the dialog says it's for: "Before you <action>, …". */
export const CONFIRMATION_ACTIONS = {
  "change-email": "change your email",
  "delete-account": "delete your account",
  "turn-on-two-factor": "turn on two-step verification",
  "turn-off-two-factor": "turn off two-step verification",
  "add-passkey": "add a passkey",
  "rename-passkey": "rename a passkey",
  "remove-passkey": "remove a passkey",
  "backup-codes": "make new backup codes",
  "add-authenticator": "set up an authenticator app",
  "remove-authenticator": "remove your authenticator app",
  sso: "change single sign-on",
} as const;

export type ConfirmationAction = keyof typeof CONFIRMATION_ACTIONS;

/** "r…@gmail.com": enough to recognise the address, not to read it out. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  return `${email.slice(0, 1)}…${email.slice(at)}`;
}

const MAIL_PROVIDERS: { domains: string[]; label: string; href: string }[] = [
  {
    domains: ["gmail.com", "googlemail.com"],
    label: "Open Gmail",
    href: "https://mail.google.com/mail/",
  },
  {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    label: "Open Outlook",
    href: "https://outlook.live.com/mail/",
  },
];

/** A link to the address's webmail, when its domain is one we know. */
export function mailProviderFor(
  email: string,
): { label: string; href: string } | null {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const provider = MAIL_PROVIDERS.find((entry) =>
    entry.domains.includes(domain),
  );
  return provider ? { label: provider.label, href: provider.href } : null;
}

export const CONFIRMATION_MESSAGES = {
  signedOut: "Sign in again to continue.",
  failed: "Something went wrong. Check your connection and try again.",
  rateLimited: "Too many tries. Wait a few minutes and try again.",
  passkeyFailed: "Couldn't verify your passkey. Try again.",
  passkeyClosed:
    "The passkey prompt was closed or timed out. Try again or use another method.",
  passkeyUnavailable:
    "Passkeys don't work in this browser. Use another method.",
  noAuthenticatorApp:
    "Your account doesn't use an authenticator app. Use your passkey or a backup code.",
  invalidCode: "Enter the 6-digit code from the email.",
  wrongCode: "That code isn't right. Check the email and try again.",
  codeExpired: "That code has expired. Send a new one.",
  tooManyCodeAttempts: "Too many wrong tries. Send a new code.",
  codeNotSent: "We couldn't send a code right now. Please try again.",
  twoFactorOn:
    "Two-step verification is on, so there's no emailed code. Use your passkey, authenticator app or a backup code.",
  signInAgain:
    "For your security, sign out and sign in again, then try again within 10 minutes.",
  stillRequired: "We couldn't confirm it's you. Try again.",
} as const;

/** The dialog's starting point, from the server. */
export interface ConfirmationOptions {
  methods: ConfirmMethod[];
  /** "r…@gmail.com", for the emailed code */
  maskedEmail: string;
  /** "Open Gmail", when the address's domain is a known webmail */
  mailProvider: { label: string; href: string } | null;
}
