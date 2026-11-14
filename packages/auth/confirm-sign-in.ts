import { createHash } from "node:crypto";
import { database as db, eq, verification } from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { CONFIRM_SIGN_IN_WRONG_ACCOUNT } from "./confirm-sign-in-rules";

// "Confirm it's you" by signing in again with Google, GitHub or workspace SSO
// (the app starts and finishes it: apps/app/lib/account/
// confirmation-sign-in-server.ts). While one is under way the browser holds
// CONFIRM_SIGN_IN_COOKIE, a random value whose SHA-256 names a `verification`
// row saying who asked. On the OAuth and SSO callbacks that cookie keeps the
// sign-in to that person (./server.ts databaseHooks): no new account is made,
// and a sign-in as anyone else is refused, so the browser stays signed in as
// it was. That needs the cookie on the callback, so only OIDC connections
// confirm: a SAML ACS is a cross-site POST, which a Lax cookie isn't sent
// with (ee/sso.ts ssoConfirmsFor). The provider is also asked to show its
// account chooser or sign-in screen (confirmSignIn below).

/**
 * HttpOnly, SameSite=Lax, 10 minutes: set by the app when it starts. Over
 * HTTPS it carries the `__Host-` prefix (Secure, Path=/, no Domain).
 */
export const CONFIRM_SIGN_IN_COOKIE = "qrdx_confirm_sign_in";
export const CONFIRM_SIGN_IN_SECURE_COOKIE = `__Host-${CONFIRM_SIGN_IN_COOKIE}`;

/** The cookie's name for a site served over HTTPS or not. */
export const confirmSignInCookieName = (secure: boolean) =>
  secure ? CONFIRM_SIGN_IN_SECURE_COOKIE : CONFIRM_SIGN_IN_COOKIE;
/** How long the sign-in has to finish. */
export const CONFIRM_SIGN_IN_MINUTES = 10;

/** Every intent row's `verification.identifier` starts with this. */
export const CONFIRM_SIGN_IN_IDENTIFIER_PREFIX = "qrdx-confirm-sign-in-";
const IDENTIFIER_PREFIX = CONFIRM_SIGN_IN_IDENTIFIER_PREFIX;

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

/** The cookie's value, under either name, else null. */
export function confirmSignInCookie(ctx: HookContext): string | null {
  return (
    cookieFrom(ctx, CONFIRM_SIGN_IN_SECURE_COOKIE) ??
    cookieFrom(ctx, CONFIRM_SIGN_IN_COOKIE)
  );
}

/** The cookie's value on a sign-in callback, else null. */
export function confirmSignInNonce(
  ctx: HookContext | null | undefined
): string | null {
  if (!(ctx && isSignInCallbackPath(ctx.path))) return null;
  return confirmSignInCookie(ctx);
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

type FindIntent = (nonce: string) => Promise<ConfirmSignInIntent | null>;

/**
 * user.create.before: while confirming, a sign-in never makes an account
 * (someone who picks a Google account that isn't linked would otherwise get
 * a new, empty one). Only while the intent is live: a cookie left behind
 * after it expired or was used (on a shared computer, say) changes nothing.
 */
export async function allowUserCreation(
  ctx: HookContext | null | undefined,
  find: FindIntent = findConfirmSignInIntent
): Promise<boolean> {
  const nonce = confirmSignInNonce(ctx);
  if (!nonce) return true;
  return (await find(nonce)) === null;
}

/**
 * session.create.before: while confirming, only the person who asked may be
 * signed in. Otherwise the hook refuses and the browser keeps the session it
 * had.
 */
export async function allowSessionCreation(
  userId: string,
  ctx: HookContext | null | undefined,
  find: FindIntent = findConfirmSignInIntent
): Promise<boolean> {
  const nonce = confirmSignInNonce(ctx);
  if (!nonce) return true;
  const intent = await find(nonce);
  // Expired or used: nothing to hold the sign-in to (the app's finishing
  // step reports it).
  if (!intent) return true;
  return intent.userId === userId;
}

/**
 * Asks the provider to show its account chooser (Google, GitHub) or sign-in
 * screen (workspace SSO over OIDC) instead of passing straight through, so
 * confirming takes the person's own hand at the provider. Best effort: a
 * provider can still skip it (GitHub shows its chooser only when more than
 * one account is signed in or the app wasn't authorised), and nothing on our
 * side can prove it was shown. Already-set values are kept.
 */
export function withProviderPrompt(url: string, provider: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.searchParams.has("prompt")) return url;
  if (provider === "google" || provider === "github") {
    parsed.searchParams.set("prompt", "select_account");
  } else if (provider === "sso") {
    parsed.searchParams.set("prompt", "login");
  } else {
    return url;
  }
  return parsed.toString();
}

const START_PATHS = new Set(["/sign-in/social", "/sign-in/sso"]);

/**
 * The plugin side of confirming by signing in again:
 * - on /sign-in/social and /sign-in/sso, while an intent is live, the
 *   provider URL asks for the chooser or sign-in screen (withProviderPrompt);
 * - signing out clears the cookie, so nothing is left for the next person.
 */
export const confirmSignIn = (find: FindIntent = findConfirmSignInIntent) =>
  ({
    id: "qrdx-confirm-sign-in",
    hooks: {
      after: [
        {
          matcher: (ctx) => START_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const nonce = confirmSignInCookie(ctx);
            if (!nonce) return;
            const returned = ctx.context.returned as
              | { url?: unknown; redirect?: unknown }
              | undefined;
            if (!returned || typeof returned.url !== "string") return;
            const intent = await find(nonce);
            if (!intent) return;
            return ctx.json({
              ...returned,
              url: withProviderPrompt(returned.url, intent.provider),
            });
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/sign-out",
          handler: createAuthMiddleware((ctx) => {
            if (!confirmSignInCookie(ctx)) return Promise.resolve();
            for (const name of [
              CONFIRM_SIGN_IN_COOKIE,
              CONFIRM_SIGN_IN_SECURE_COOKIE,
            ]) {
              ctx.setCookie(name, "", {
                httpOnly: true,
                sameSite: "lax",
                secure: name === CONFIRM_SIGN_IN_SECURE_COOKIE,
                path: "/",
                maxAge: 0,
              });
            }
            return Promise.resolve();
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
