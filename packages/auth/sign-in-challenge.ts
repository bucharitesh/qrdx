import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import {
  CHALLENGE_COMPLETION_PATHS,
  challengePageUrl,
  challengeReturnPath,
  PASSKEY_SIGN_IN_PATH,
  passkeyAssertionUserVerified,
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
// - a request that already carries a live session of the same person (a
//   session refresh, switching workspace, turning 2FA on or off): no access
//   is gained that the browser didn't already have.
//
// The challenge itself is the plugin's own after-hook handler, reused as is:
// it honours the trust-device cookie, swaps the new session for the
// two_factor cookie (10 minutes) and starts the attempts counter. JSON
// endpoints answer { twoFactorRedirect: true } like a password sign-in;
// endpoints that end in a redirect (OAuth and SSO callbacks) send the browser
// to /sign-in/two-factor?next=<where it was going> instead.
//
// apps/docs/tests/lib/sign-in-challenge.test.ts classifies every endpoint
// path, so a new plugin can't add one without someone deciding.

type Middleware = ReturnType<typeof createAuthMiddleware>;

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
    hooks: {
      before: [
        {
          // Over HTTP these only finish a pending challenge. With a session
          // they would check codes without the plugin's attempt limits or
          // lockout; the app's own checks go through auth.api instead.
          matcher: (ctx) =>
            CHALLENGE_COMPLETION_PATHS.includes(ctx.path ?? "") &&
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
            if ((await liveSessionUserId(ctx)) === data.user.id) return;

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
              throw ctx.redirect(
                challengePageUrl(
                  appOrigin,
                  challengeReturnPath(location, appOrigin)
                )
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

/** The user of the live session the request came with, if any. */
async function liveSessionUserId(ctx: HookContext): Promise<string | null> {
  const token = await ctx.getSignedCookie(
    ctx.context.authCookies.sessionToken.name,
    ctx.context.secret
  );
  if (!token) return null;
  const found = await ctx.context.internalAdapter.findSession(token);
  if (!found || new Date(found.session.expiresAt).getTime() <= Date.now()) {
    return null;
  }
  return found.session.userId;
}
