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
import type { PasskeyRelyingParty } from "./passkey-rp";
import { passkeyStepEndpoints } from "./sign-in-challenge-passkey";
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
  totpIsSetUp,
} from "./sign-in-challenge-rules";
import {
  CHALLENGE_ERRORS,
  liveSessionUserId,
  pendingChallenge,
  requestSessionToken,
  TRUST_DEVICE_COOKIE,
  TWO_FACTOR_COOKIE,
  trustDeviceMaxAge,
  trustToken,
} from "./sign-in-challenge-session";

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
// It's answered with an authenticator code, a backup code (the plugin's
// endpoints) or one of the person's passkeys (./sign-in-challenge-passkey.ts,
// whose endpoints this plugin adds). GET /two-factor/methods tells the page
// which of those the person has set up.
//
// A sign-in that is a POST ending in a redirect (the SAML ACS, posted by the
// identity provider from another site) can't see the trust-device cookie:
// it's SameSite=Lax, so cross-site POSTs don't carry it. Those go through
// GET /two-factor/continue first (CHALLENGE_CONTINUE_PATH), a top-level
// navigation that does carry it; it finishes the challenge on a trusted
// device and sends everyone else on to the page.
//
// A backup code that finishes a challenge is emailed to the account's
// address (registerBackupCodeNotifier, sent by the app: this package has no
// email stack). It never holds up or fails the sign-in.
//
// apps/docs/tests/auth/sign-in-challenge-guard.test.ts classifies every endpoint
// path, so a new plugin can't add one without someone deciding.

type Middleware = ReturnType<typeof createAuthMiddleware>;
type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const BACKUP_CODE_PATH = "/two-factor/verify-backup-code";
const TOTP_CODE_PATH = "/two-factor/verify-totp";

/** A backup code finished someone's sign-in. */
export interface BackupCodeUse {
  user: { id: string; email: string };
  /** The request's headers: the app reads device, place and address from them */
  headers: Headers;
}

/** Emails the notice. Throw when it couldn't be sent; it's logged. */
export type BackupCodeNotifier = (use: BackupCodeUse) => Promise<void> | void;

// On globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the notifier the app registered.
const BACKUP_CODE_NOTIFIER = Symbol.for("@repo/auth/backup-code-notifier");
type BackupCodeNotifierSlot = Record<symbol, BackupCodeNotifier | undefined>;

export function registerBackupCodeNotifier(notifier: BackupCodeNotifier): void {
  (globalThis as unknown as BackupCodeNotifierSlot)[BACKUP_CODE_NOTIFIER] =
    notifier;
}

// No ids, emails or addresses in these logs.
function logBackupCodeNotice(
  level: "info" | "error",
  fields: Record<string, unknown>
) {
  console[level](
    JSON.stringify({ event: "auth.backup_code_notice", ...fields })
  );
}

/**
 * After a backup code was accepted over HTTP (the second step of a sign-in;
 * signed-in browsers are refused before the plugin runs, and the app's
 * "Confirm it's you" checks call auth.api and send their own notice): hands
 * the account to the app's notifier. Never throws.
 */
async function notifyBackupCodeUsed(ctx: HookContext): Promise<void> {
  try {
    const returned = ctx.context.returned as
      | { user?: { id?: unknown } }
      | null
      | undefined;
    if (!returned || isAPIError(returned)) return;
    const userId = returned.user?.id;
    if (typeof userId !== "string") {
      logBackupCodeNotice("error", { outcome: "no-user" });
      return;
    }
    const notifier = (globalThis as unknown as BackupCodeNotifierSlot)[
      BACKUP_CODE_NOTIFIER
    ];
    if (!notifier) {
      logBackupCodeNotice("error", { outcome: "no-notifier" });
      return;
    }
    const user = await ctx.context.internalAdapter.findUserById(userId);
    if (!user?.email) {
      logBackupCodeNotice("error", { outcome: "no-email" });
      return;
    }
    await notifier({
      user: { id: userId, email: user.email },
      headers: new Headers(ctx.request?.headers),
    });
  } catch (error) {
    logBackupCodeNotice("error", {
      outcome: "not-sent",
      error: error instanceof Error ? error.name : "unknown",
      // A failed query's message can carry its parameters (ids), and a
      // sender's can carry the address.
      message:
        error instanceof Error
          ? error.message
              .split(/\bparams:/)[0]
              .replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, "<address>")
              .slice(0, 300)
          : undefined,
    });
  }
}

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

export interface SignInChallengeOptions {
  /**
   * Where passkeys work (./passkey-rp.ts); null turns the passkey second
   * step off (GET /two-factor/methods then never offers it).
   */
  relyingParty: PasskeyRelyingParty | null;
}

export function signInChallenge(
  twoFactorPlugin: TwoFactorPluginLike,
  { relyingParty }: SignInChallengeOptions
) {
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
      ...passkeyStepEndpoints(relyingParty),
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
          // An account whose second step has no authenticator app (a
          // passkey only) never takes an authenticator code at sign-in,
          // whatever its twoFactor row holds.
          matcher: (ctx) =>
            ctx.path === TOTP_CODE_PATH && ctx.request instanceof Request,
          handler: createAuthMiddleware(async (ctx) => {
            const pending = await pendingChallenge(ctx);
            if (!pending) return;
            const row = await ctx.context.adapter.findOne<{
              secret?: string | null;
              verified?: boolean | null;
            }>({
              model: "twoFactor",
              where: [{ field: "userId", value: pending.userId }],
            });
            if (!totpIsSetUp(row)) {
              throw new APIError("BAD_REQUEST", {
                ...CHALLENGE_ERRORS.TOTP_NOT_ENABLED,
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
          // A backup code finished a sign-in: the account's address is told.
          matcher: (ctx) =>
            ctx.path === BACKUP_CODE_PATH && ctx.request instanceof Request,
          handler: createAuthMiddleware(async (ctx) => {
            await notifyBackupCodeUsed(ctx);
          }),
        },
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

  const trustMaxAge = trustDeviceMaxAge(ctx);
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
