/**
 * "Confirm it's you": a short check before changes to the account's security
 * (the email, deleting the account, two-step verification and its methods,
 * passkeys, workspace single sign-on). Pure and client-safe; the server side
 * is ./confirmation-server.ts and the dialog components/confirm-identity/.
 *
 * - Two-step verification on: a passkey, a code from the authenticator app
 *   or a backup code. Never an emailed code or another sign-in: getting into
 *   the mailbox or a Google account must not get around the second step.
 * - Off: a passkey when the account has one, a 6-digit code emailed to the
 *   account's address, or signing in again with a linked Google, GitHub or
 *   workspace SSO account (the provider checks the person again; see
 *   ./confirmation-sign-in-server.ts). Where this deployment can't send
 *   codes, a sign-in within the last 10 minutes also counts.
 *
 * A finished sign-in counts too, for its new session: any sign-in with
 * two-step verification off, and with it on only one whose second step was
 * answered or a passkey sign-in, never one a trusted device let skip it
 * (packages/auth/new-sign-in.ts).
 *
 * Each of these is something a stolen session cookie alone doesn't give.
 *
 * A confirmation lasts 10 minutes for the session that made it, so several
 * changes in a row ask once. A gated server action answers
 * `{ ok: false, error: "CONFIRMATION_REQUIRED" }` without one; the client's
 * useConfirmation() opens the dialog and tries the action again.
 */

import {
  CONFIRM_RETURN_FAILED,
  CONFIRM_RETURN_PARAM,
  CONFIRM_RETURNED,
  CONFIRM_SIGN_IN_WRONG_ACCOUNT,
} from "@repo/auth/confirm-sign-in-rules";
import { UNVERIFIED_SIGN_UP_ERROR } from "@repo/auth/verified-sign-up";

/** How long a confirmation lasts for its session (a finished sign-in too). */
export { CONFIRMATION_MINUTES } from "@repo/auth/confirm-sign-in-rules";
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

/** Signing in again with one of these confirms, without two-step on. */
export const CONFIRM_SIGN_IN_PROVIDERS = ["google", "github", "sso"] as const;
export type ConfirmSignInProvider = (typeof CONFIRM_SIGN_IN_PROVIDERS)[number];

export function isConfirmSignInProvider(
  value: unknown,
): value is ConfirmSignInProvider {
  return (CONFIRM_SIGN_IN_PROVIDERS as readonly unknown[]).includes(value);
}

/**
 * The ways to confirm. "sign-in-again" (sign out, sign in, come back within
 * 10 minutes) is the fallback for accounts without two-step verification on
 * a deployment that can't send codes.
 */
export type ConfirmMethod =
  | "passkey"
  | "totp"
  | "backup"
  | "email"
  | ConfirmSignInProvider
  | "sign-in-again";

/** The account's methods, preferred first. */
export function confirmationMethodsFor({
  twoFactorOn,
  authenticatorApp,
  passkeys,
  emailCodes,
  signIns = [],
}: {
  twoFactorOn: boolean;
  /** An authenticator app is set up (not only started) */
  authenticatorApp: boolean;
  /** Passkeys the account has (and this deployment can use) */
  passkeys: number;
  /** This deployment can deliver a code to the account's address */
  emailCodes: boolean;
  /** Linked sign-ins this deployment offers (Google, GitHub, workspace SSO) */
  signIns?: readonly ConfirmSignInProvider[];
}): ConfirmMethod[] {
  const methods: ConfirmMethod[] = [];
  if (passkeys > 0) methods.push("passkey");
  if (twoFactorOn) {
    if (authenticatorApp) methods.push("totp");
    methods.push("backup");
    return methods;
  }
  if (emailCodes) methods.push("email");
  for (const provider of CONFIRM_SIGN_IN_PROVIDERS) {
    if (signIns.includes(provider)) methods.push(provider);
  }
  if (!emailCodes) methods.push("sign-in-again");
  return methods;
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
  "support-change": "make this change for someone",
  "link-sign-in": "link a sign-in method",
  "unlink-sign-in": "unlink a sign-in method",
  "create-api-key": "create an API key",
  "create-oauth-app": "create an OAuth app",
  "new-client-secret": "make a new client secret",
  "delete-workspace": "delete this workspace",
  "change-member-role": "change someone's role",
  "remove-member": "remove someone from this workspace",
  "invite-admin": "invite an admin",
  "admin-join-link": "let a join link add admins",
  "require-two-factor": "require two-step verification",
  "stop-requiring-two-factor": "stop requiring two-step verification",
  "continue-session": "continue",
  "cancel-two-factor-reset": "cancel support's turn-off",
  "authorize-app": "let this app use your account",
  "reveal-webhook-secret": "show a signing secret",
  "rotate-webhook-secret": "make a new signing secret",
  "create-webhook": "add a webhook",
  "change-webhook-url": "send a webhook to a new address",
  "add-notification-webhook": "send notifications to a new address",
  "add-slack-channel": "add a Slack channel",
  "connect-data-out": "send your scans or form answers to another tool",
} as const;

export type ConfirmationAction = keyof typeof CONFIRMATION_ACTIONS;

/**
 * The dialog's "Why am I asked?" for an action with a reason of its own;
 * the others share the one about security changes.
 */
export const CONFIRMATION_REASONS: Partial<Record<ConfirmationAction, string>> =
  {
    // A session used from a new country and browser (./session-origin.ts).
    "continue-session":
      "This sign-in is being used from a different country and a different browser than where it started, so we check it's you before anything else.",
  };

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
  signInUnavailable:
    "That sign-in isn't linked to your account. Use another method.",
  signInFailed:
    "That sign-in didn't go through, so nothing changed. Try again or use another method.",
  signInNotLinked:
    "That account isn't linked to your QRdx account, so nothing changed. Sign in with the one you linked, or use another method.",
  signInExpired:
    "That took longer than 10 minutes, so nothing changed. Try again.",
  signInDifferentAccount:
    "You signed in to a different QRdx account, so nothing changed here. Sign out, then sign in to the account you want to change.",
  signInTwoFactorOn:
    "Two-step verification is on now, so confirm with it instead: your passkey, authenticator app or a backup code.",
  signInConfirmed:
    "Thanks, that's confirmed. You can make your change in the next 10 minutes.",
} as const;

/** Where the dialog came back to after signing in again: `?confirm=…`. */
export {
  CONFIRM_RETURN_FAILED,
  CONFIRM_RETURN_PARAM,
  CONFIRM_RETURNED,
} from "@repo/auth/confirm-sign-in-rules";

/** The query keys the return adds (ours and Better Auth's). */
export const CONFIRM_RETURN_KEYS = [
  CONFIRM_RETURN_PARAM,
  "error",
  "error_description",
] as const;

/**
 * Where signing in again comes back to: this page (path and query), without
 * an earlier outcome or Better Auth error, plus `?confirm=<outcome>`.
 * Same-origin and relative, as Better Auth's callback URLs need.
 */
export function confirmReturnPath(href: string, outcome: string): string {
  const url = new URL(href);
  for (const key of CONFIRM_RETURN_KEYS) url.searchParams.delete(key);
  url.searchParams.set(CONFIRM_RETURN_PARAM, outcome);
  return `${url.pathname}${url.search}`;
}

/**
 * Back on the page after signing in again: what happened, and the address
 * without the keys the return added. Null when this load isn't a return.
 */
export function readConfirmReturn(href: string): {
  failed: boolean;
  error: string | null;
  cleanPath: string;
} | null {
  const url = new URL(href);
  const outcome = url.searchParams.get(CONFIRM_RETURN_PARAM);
  if (outcome !== CONFIRM_RETURNED && outcome !== CONFIRM_RETURN_FAILED) {
    return null;
  }
  const error = url.searchParams.get("error")?.slice(0, 64) ?? null;
  for (const key of CONFIRM_RETURN_KEYS) url.searchParams.delete(key);
  return {
    failed: outcome === CONFIRM_RETURN_FAILED,
    error,
    cleanPath: `${url.pathname}${url.search}${url.hash}`,
  };
}

/** Better Auth's callback errors (`?error=`) after signing in again. */
export function confirmSignInErrorMessage(code: string | null): string {
  switch (code) {
    case CONFIRM_SIGN_IN_WRONG_ACCOUNT:
    case "unable_to_create_user":
    case "unable_to_create_session":
    case "account_not_linked":
    case "signup_disabled":
    // A provider that hasn't verified the address never makes an account
    // (packages/auth/verified-sign-up.ts), so it can't be the linked one.
    case UNVERIFIED_SIGN_UP_ERROR.github:
    case UNVERIFIED_SIGN_UP_ERROR.google:
    case UNVERIFIED_SIGN_UP_ERROR.other:
      return CONFIRMATION_MESSAGES.signInNotLinked;
    default:
      return CONFIRMATION_MESSAGES.signInFailed;
  }
}

/** The dialog's starting point, from the server. */
export interface ConfirmationOptions {
  methods: ConfirmMethod[];
  /** "r…@gmail.com", for the emailed code */
  maskedEmail: string;
  /** "Open Gmail", when the address's domain is a known webmail */
  mailProvider: { label: string; href: string } | null;
}
