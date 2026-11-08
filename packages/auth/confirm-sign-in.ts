import { createHash } from "node:crypto";
import { database as db, eq, verification } from "@repo/database";
import { APIError } from "better-auth/api";
import { CONFIRM_SIGN_IN_WRONG_ACCOUNT } from "./confirm-sign-in-rules";

// "Confirm it's you" by signing in again with Google, GitHub or workspace SSO
// (the app starts and finishes it: apps/docs/lib/account/
// confirmation-sign-in-server.ts). While one is under way the browser holds
// CONFIRM_SIGN_IN_COOKIE, a random value whose SHA-256 names a `verification`
// row saying who asked. On the OAuth and SSO callbacks that cookie keeps the
// sign-in to that person (./server.ts databaseHooks): no new account is made,
// and a sign-in as anyone else is refused, so the browser stays signed in as
// it was. The SAML ACS is a cross-site POST, which doesn't carry the cookie;
// the app's finishing step catches a different account there instead.

/** HttpOnly, SameSite=Lax, 10 minutes: set by the app when it starts. */
export const CONFIRM_SIGN_IN_COOKIE = "qrdx_confirm_sign_in";
/** How long the sign-in has to finish. */
export const CONFIRM_SIGN_IN_MINUTES = 10;

const IDENTIFIER_PREFIX = "qrdx-confirm-sign-in-";

/** The `verification` identifier for a cookie value (never the value). */
export function confirmSignInIdentifier(nonce: string): string {
  return `${IDENTIFIER_PREFIX}${createHash("sha256").update(nonce).digest("base64url")}`;
}

/** Who asked, and from which session (stored as the row's value). */
export interface ConfirmSignInIntent {
  userId: string;
  provider: string;
  fromSessionId: string;
}

export function parseConfirmSignInIntent(
  value: string
): ConfirmSignInIntent | null {
  try {
    const parsed = JSON.parse(value) as Partial<ConfirmSignInIntent>;
    if (
      typeof parsed.userId === "string" &&
      typeof parsed.provider === "string" &&
      typeof parsed.fromSessionId === "string"
    ) {
      return {
        userId: parsed.userId,
        provider: parsed.provider,
        fromSessionId: parsed.fromSessionId,
      };
    }
  } catch {
    // Not one of ours.
  }
  return null;
}

// Google and GitHub come back to /callback/:id, workspace SSO (OIDC) to
// /sso/callback/:providerId and SAML to /sso/saml2/sp/acs/:providerId.
const CALLBACK_PREFIXES = ["/callback/", "/sso/callback", "/sso/saml2/sp/acs"];

export function isSignInCallbackPath(path: string | undefined): boolean {
  return Boolean(
    path && CALLBACK_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

/**
 * What Better Auth's database hooks get as their context (or null): the
 * endpoint's outer context, which has the route's path and the request's
 * headers but not always better-call's getCookie.
 */
interface HookContext {
  path?: string;
  getCookie?: (name: string) => string | null | undefined;
  headers?: Headers;
  request?: Request;
}

/** A cookie's value from the context: its getter, else the Cookie header. */
export function cookieFrom(ctx: HookContext, name: string): string | null {
  const viaGetter =
    typeof ctx.getCookie === "function" ? ctx.getCookie(name) : null;
  if (typeof viaGetter === "string" && viaGetter) return viaGetter;
  const header =
    ctx.headers?.get("cookie") ?? ctx.request?.headers.get("cookie") ?? null;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw) || null;
    } catch {
      return raw || null;
    }
  }
  return null;
}

/** The cookie's value on a sign-in callback, else null. */
export function confirmSignInNonce(
  ctx: HookContext | null | undefined
): string | null {
  if (!(ctx && isSignInCallbackPath(ctx.path))) return null;
  return cookieFrom(ctx, CONFIRM_SIGN_IN_COOKIE);
}

/** The unexpired intent the cookie names, else null. */
export async function findConfirmSignInIntent(
  nonce: string
): Promise<ConfirmSignInIntent | null> {
  const [row] = await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, confirmSignInIdentifier(nonce)))
    .limit(1);
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return parseConfirmSignInIntent(row.value);
}

/**
 * The refusal the hooks throw. Better Auth's OAuth, OIDC and SAML callbacks
 * turn an APIError with a code into a redirect to the error URL with
 * `?error=<code>` (returning false from a hook works too, but logs a
 * misleading TypeError on the way).
 */
export function confirmSignInRefused(): APIError {
  return new APIError("FORBIDDEN", {
    code: CONFIRM_SIGN_IN_WRONG_ACCOUNT,
    message: "That sign-in isn't the account that asked to confirm.",
  });
}

/**
 * user.create.before: while confirming, a sign-in never makes an account
 * (someone who picks a Google account that isn't linked would otherwise get
 * a new, empty one).
 */
export function allowUserCreation(
  ctx: HookContext | null | undefined
): boolean {
  return confirmSignInNonce(ctx) === null;
}

/**
 * session.create.before: while confirming, only the person who asked may be
 * signed in. Otherwise the hook refuses and the browser keeps the session it
 * had.
 */
export async function allowSessionCreation(
  userId: string,
  ctx: HookContext | null | undefined,
  find: (
    nonce: string
  ) => Promise<ConfirmSignInIntent | null> = findConfirmSignInIntent
): Promise<boolean> {
  const nonce = confirmSignInNonce(ctx);
  if (!nonce) return true;
  const intent = await find(nonce);
  // Expired or used: nothing to hold the sign-in to (the app's finishing
  // step reports it).
  if (!intent) return true;
  return intent.userId === userId;
}
