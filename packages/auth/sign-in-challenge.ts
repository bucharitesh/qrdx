import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  isAPIError,
} from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";
import { constantTimeEqual, generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import {
  CHALLENGE_CODE_PATHS,
  CHALLENGE_COMPLETION_PATHS,
  CHALLENGE_CONTINUE_PATH,
  CONTINUE_DEFAULT_PATH,
  challengeContinueUrl,
  challengePageUrl,
  challengeReturnPath,
  continueNextPath,
  normalizeBackupCode,
  PASSKEY_SIGN_IN_PATH,
  passkeyAssertionUserVerified,
  SERVER_SESSION_SWAP_PATHS,
  TRUST_DEVICE_DAYS,
} from "./sign-in-challenge-rules";

// Two-step verification for every way in. Better Auth's twoFactor plugin only
// challenges password sign-ins (/sign-in/email, /sign-in/username,
// /sign-in/phone-number), which QRdx doesn't have. This plugin runs the same
// challenge after ANY endpoint that creates a session for someone with
// two-step verification on: email codes, Google and GitHub callbacks,
// workspace SSO callbacks and whatever a later plugin adds. It doesn't list
// sign-in paths, so a new one is challenged by default; the exemptions are:
//
// - finishing a challenge (CHALLENGE_COMPLETION_PATHS);
// - a passkey sign-in whose authenticator verified the user (two factors);
// - the app's own 2FA management calls made server-side (auth.api, not HTTP)
//   on SERVER_SESSION_SWAP_PATHS: turning 2FA on or off swaps the session
//   after the app's own checks. Other server-side sign-ins are challenged;
// - a request that re-issues the session it came with, same token (a
//   session refresh, switching workspace, a profile update): no access is
//   gained that the browser didn't already have.
//
// Any other new session over HTTP is challenged, even when the browser
// already holds a live session of the same person: an old (stolen) cookie
// plus the mailbox must not mint a fresh session, which is what adding a
// passkey or changing the email checks for.
//
// The challenge itself is the plugin's own after-hook handler, reused as is:
// it honours the trust-device cookie, swaps the new session for the
// two_factor cookie (10 minutes) and starts the attempts counter. JSON
// endpoints answer { twoFactorRedirect: true } like a password sign-in;
// endpoints that end in a redirect (OAuth and SSO callbacks) send the browser
// to /sign-in/two-factor?next=<where it was going> instead.
//
// A sign-in that is a POST ending in a redirect (the SAML ACS, posted by the
// identity provider from another site) can't see the trust-device cookie:
// it's SameSite=Lax, so cross-site POSTs don't carry it. Those go through
// GET /two-factor/continue first (CHALLENGE_CONTINUE_PATH), a top-level
// navigation that does carry it; it finishes the challenge on a trusted
// device and sends everyone else on to the page.
//
// apps/docs/tests/auth/sign-in-challenge-guard.test.ts classifies every endpoint
// path, so a new plugin can't add one without someone deciding.

type Middleware = ReturnType<typeof createAuthMiddleware>;

const BACKUP_CODE_PATH = "/two-factor/verify-backup-code";
// The twoFactor plugin's cookie names (better-auth/dist/plugins/two-factor/
// constant.mjs).
const TWO_FACTOR_COOKIE = "two_factor";
const TRUST_DEVICE_COOKIE = "trust_device";

interface TwoFactorPluginLike {
  id: string;
  hooks?: { after?: { handler: Middleware }[] };
}

interface NewSession {
  session: { token: string };
  user: { id: string; twoFactorEnabled?: boolean | null };
}

/** The twoFactor plugin's after-hook handler: the challenge itself. */
function challengeHandler(plugin: TwoFactorPluginLike): Middleware {
  const handler = plugin.hooks?.after?.[0]?.handler;
  if (plugin.id !== "two-factor" || !handler) {
    throw new Error(
      "signInChallenge needs the twoFactor plugin's after hook; the plugin's shape changed"
    );
  }
  return handler;
}

export function signInChallenge(twoFactorPlugin: TwoFactorPluginLike) {
  const challenge = challengeHandler(twoFactorPlugin);

  return {
    id: "qrdx-sign-in-challenge",
    endpoints: {
      continueTwoFactor: createAuthEndpoint(
        CHALLENGE_CONTINUE_PATH,
        {
          method: "GET",
          query: z.object({ next: z.string().optional() }),
        },
        (ctx) => continueOnTrustedDevice(ctx)
      ),
    },
    hooks: {
      before: [
        {
          // Over HTTP these only finish a pending challenge. With a session
          // they would check codes without the plugin's attempt limits or
          // lockout; the app's own checks go through auth.api instead.
          matcher: (ctx) =>
            CHALLENGE_CODE_PATHS.includes(ctx.path ?? "") &&
            ctx.request instanceof Request,
          handler: createAuthMiddleware(async (ctx) => {
            if (await liveSessionUserId(ctx)) {
              throw new APIError("FORBIDDEN", {
                message: "Already signed in",
                code: "ALREADY_SIGNED_IN",
              });
            }
          }),
        },
        {
          // Backup codes are stored as "ABCDE-FGH23" and the plugin compares
          // by exact match; people type them in any case, with or without
          // the dash. Anything that can't be a code goes through unchanged
          // and fails as a wrong code.
          matcher: (ctx) => ctx.path === BACKUP_CODE_PATH,
          handler: createAuthMiddleware(
            (ctx): Promise<{ context: { body: unknown } } | undefined> => {
              const code = normalizeBackupCode(ctx.body?.code);
              if (code && code !== ctx.body?.code) {
                return Promise.resolve({
                  context: { body: { ...ctx.body, code } },
                });
              }
              return Promise.resolve(undefined);
            }
          ),
        },
      ],
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const data = ctx.context.newSession as NewSession | null;
            if (!data) return;
            const path = ctx.path ?? "";
            if (CHALLENGE_COMPLETION_PATHS.includes(path)) return;
            if (
              path === PASSKEY_SIGN_IN_PATH &&
              passkeyAssertionUserVerified(ctx.body)
            ) {
              return;
            }

            // The session's user can be partial (built by a plugin), so the
            // switch is read from the database.
            const user = (await ctx.context.internalAdapter.findUserById(
              data.user.id
            )) as { twoFactorEnabled?: boolean | null } | null;
            if (!user?.twoFactorEnabled) return;
            if (
              !(ctx.request instanceof Request) &&
              SERVER_SESSION_SWAP_PATHS.includes(path)
            ) {
              return;
            }
            if ((await requestSessionToken(ctx)) === data.session.token) return;

            // The plugin reads the switch from the new session.
            if (data.user.twoFactorEnabled !== true) {
              ctx.context.setNewSession({
                ...data,
                user: { ...data.user, twoFactorEnabled: true },
              } as never);
            }
            const result = (await challenge({
              ...ctx,
              returnHeaders: true,
            } as never)) as {
              headers?: Headers;
              response?: { twoFactorRedirect?: boolean };
            };
            result.headers?.forEach((value, key) => {
              if (key.toLowerCase() === "set-cookie") {
                ctx.responseHeaders?.append(key, value);
              } else {
                ctx.setHeader(key, value);
              }
            });
            // A trusted device: the plugin kept the session.
            if (!result.response?.twoFactorRedirect) return;

            const returned = ctx.context.returned;
            if (isAPIError(returned) && returned.statusCode === 302) {
              const appOrigin = new URL(ctx.context.baseURL).origin;
              const location =
                ctx.context.responseHeaders?.get("location") ??
                new Headers(returned.headers).get("location");
              const next = challengeReturnPath(location, appOrigin);
              // A POST may have come from another site without the
              // trust-device cookie; the GET in between gets it.
              throw ctx.redirect(
                ctx.request?.method === "POST"
                  ? challengeContinueUrl(ctx.context.baseURL, next)
                  : challengePageUrl(appOrigin, next)
              );
            }
            return ctx.json(result.response);
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** The session token cookie the request came with, if any (signed). */
async function requestSessionToken(
  ctx: HookContext | GenericEndpointContext
): Promise<string | null> {
  return (
    (await ctx.getSignedCookie(
      ctx.context.authCookies.sessionToken.name,
      ctx.context.secret
    )) || null
  );
}

/** The user of the live session the request came with, if any. */
async function liveSessionUserId(
  ctx: HookContext | GenericEndpointContext
): Promise<string | null> {
  const token = await requestSessionToken(ctx);
  if (!token) return null;
  const found = await ctx.context.internalAdapter.findSession(token);
  if (!found || new Date(found.session.expiresAt).getTime() <= Date.now()) {
    return null;
  }
  return found.session.userId;
}

/** HMAC-SHA256, base64url without padding: the twoFactor plugin's token. */
async function trustToken(secret: string, value: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(value)
    )
  );
  return btoa(String.fromCharCode(...signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/[=]+$/, "");
}

/**
 * GET /two-factor/continue?next=<path>: the pending challenge (two_factor
 * cookie) is finished without a code only when this browser also holds a
 * valid trust-device cookie for the same person, checked exactly as the
 * twoFactor plugin's own after-hook checks it (HMAC of
 * `${userId}!${trustIdentifier}` with the auth secret, and a live
 * verification record holding the user id). Then, like verifyTwoFactor:
 * the challenge is consumed (once), a session is made (honouring "don't
 * remember me"), the trust record and cookie are rotated, and the browser
 * goes to `next`. In every other case it goes to the challenge page.
 */
async function continueOnTrustedDevice(ctx: GenericEndpointContext) {
  const appOrigin = new URL(ctx.context.baseURL).origin;
  const next = continueNextPath(
    (ctx.query as { next?: unknown } | undefined)?.next,
    appOrigin
  );
  const toPage = () => ctx.redirect(challengePageUrl(appOrigin, next));

  const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
  const challengeId = await ctx.getSignedCookie(
    twoFactorCookie.name,
    ctx.context.secret
  );
  if (!challengeId) throw toPage();
  const pending =
    await ctx.context.internalAdapter.findVerificationValue(challengeId);
  if (!pending || new Date(pending.expiresAt).getTime() <= Date.now()) {
    throw toPage();
  }
  const userId = pending.value;

  // Someone else is signed in in this browser: the page handles it.
  const live = await liveSessionUserId(ctx);
  if (live && live !== userId) throw toPage();

  const twoFactorPlugin = ctx.context.getPlugin("two-factor") as {
    options?: { trustDeviceMaxAge?: number };
  } | null;
  const trustMaxAge =
    twoFactorPlugin?.options?.trustDeviceMaxAge ??
    TRUST_DEVICE_DAYS * 24 * 60 * 60;
  const trustCookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE, {
    maxAge: trustMaxAge,
  });
  const trusted = await ctx.getSignedCookie(
    trustCookie.name,
    ctx.context.secret
  );
  if (!trusted) throw toPage();
  const [token, trustIdentifier] = trusted.split("!");
  const record =
    token && trustIdentifier
      ? await ctx.context.internalAdapter.findVerificationValue(trustIdentifier)
      : null;
  const valid =
    token &&
    trustIdentifier &&
    constantTimeEqual(
      token,
      await trustToken(ctx.context.secret, `${userId}!${trustIdentifier}`)
    ) &&
    record &&
    record.value === userId &&
    new Date(record.expiresAt).getTime() > Date.now();
  if (!valid) {
    // Not this person's, or no longer valid: dropped, as the plugin does.
    expireCookie(ctx, trustCookie);
    throw toPage();
  }

  // The challenge works once.
  const consumed =
    await ctx.context.internalAdapter.consumeVerificationValue(challengeId);
  if (!consumed || consumed.value !== userId) {
    expireCookie(ctx, twoFactorCookie);
    throw toPage();
  }
  const user = await ctx.context.internalAdapter.findUserById(userId);
  if (!user) {
    expireCookie(ctx, twoFactorCookie);
    throw toPage();
  }
  const dontRememberMe = await ctx.getSignedCookie(
    ctx.context.authCookies.dontRememberToken.name,
    ctx.context.secret
  );
  const session = await ctx.context.internalAdapter.createSession(
    userId,
    !!dontRememberMe
  );
  if (!session) throw toPage();
  await setSessionCookie(ctx, { session, user });
  expireCookie(ctx, twoFactorCookie);

  // A new trust record and cookie for the next 30 days, as the plugin does.
  await ctx.context.internalAdapter.deleteVerificationByIdentifier(
    trustIdentifier
  );
  const newIdentifier = `trust-device-${generateRandomString(32)}`;
  await ctx.context.internalAdapter.createVerificationValue({
    value: userId,
    identifier: newIdentifier,
    expiresAt: new Date(Date.now() + trustMaxAge * 1000),
  });
  await ctx.setSignedCookie(
    trustCookie.name,
    `${await trustToken(ctx.context.secret, `${userId}!${newIdentifier}`)}!${newIdentifier}`,
    ctx.context.secret,
    trustCookie.attributes
  );
  throw ctx.redirect(new URL(next ?? CONTINUE_DEFAULT_PATH, appOrigin).href);
}
