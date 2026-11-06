import type { GenericEndpointContext } from "better-auth";
import { APIError, type createAuthMiddleware } from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { parseUserOutput } from "better-auth/db";
import { TRUST_DEVICE_DAYS } from "./sign-in-challenge-rules";

// The pending challenge and how it ends, shared by the challenge plugin's
// endpoints (./sign-in-challenge.ts, ./sign-in-challenge-passkey.ts). Cookie
// names, records and the trust-device token are the twoFactor plugin's own
// (better-auth/dist/plugins/two-factor/verify-two-factor.mjs), so a challenge
// finished here is indistinguishable from one finished with a TOTP code.

// The twoFactor plugin's cookie names (better-auth/dist/plugins/two-factor/
// constant.mjs).
export const TWO_FACTOR_COOKIE = "two_factor";
export const TRUST_DEVICE_COOKIE = "trust_device";

/** The twoFactor plugin's error codes the challenge answers with. */
export const CHALLENGE_ERRORS = {
  INVALID_TWO_FACTOR_COOKIE: {
    code: "INVALID_TWO_FACTOR_COOKIE",
    message: "Invalid two factor cookie",
  },
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: {
    code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
    message: "Too many attempts. Please request a new code.",
  },
  ACCOUNT_TEMPORARILY_LOCKED: {
    code: "ACCOUNT_TEMPORARILY_LOCKED",
    message:
      "Too many failed verification attempts. Your account is temporarily locked. Please try again later.",
  },
  TOTP_NOT_ENABLED: { code: "TOTP_NOT_ENABLED", message: "TOTP not enabled" },
} as const;

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
export type ChallengeContext = HookContext | GenericEndpointContext;

/** The session token cookie the request came with, if any (signed). */
export async function requestSessionToken(
  ctx: ChallengeContext
): Promise<string | null> {
  return (
    (await ctx.getSignedCookie(
      ctx.context.authCookies.sessionToken.name,
      ctx.context.secret
    )) || null
  );
}

/** The user of the live session the request came with, if any. */
export async function liveSessionUserId(
  ctx: ChallengeContext
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
export async function trustToken(
  secret: string,
  value: string
): Promise<string> {
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

/** How long "Don't ask again on this device" lasts, in seconds. */
export function trustDeviceMaxAge(ctx: ChallengeContext): number {
  const plugin = ctx.context.getPlugin("two-factor") as {
    options?: { trustDeviceMaxAge?: number };
  } | null;
  return plugin?.options?.trustDeviceMaxAge ?? TRUST_DEVICE_DAYS * 24 * 60 * 60;
}

export interface PendingChallenge {
  /** The challenge's verification identifier ("2fa-…"), the cookie's value. */
  id: string;
  /** Who is signing in. */
  userId: string;
  expiresAt: Date;
}

/**
 * This browser's pending challenge (the signed two_factor cookie and its
 * live verification record), or null.
 */
export async function pendingChallenge(
  ctx: ChallengeContext
): Promise<PendingChallenge | null> {
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
  const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!id) return null;
  const record = await ctx.context.internalAdapter.findVerificationValue(id);
  if (!record) return null;
  const expiresAt = new Date(record.expiresAt);
  if (expiresAt.getTime() <= Date.now()) return null;
  return { id, userId: record.value, expiresAt };
}

/** The pending challenge, or a 401 like the plugin's own endpoints. */
export async function requirePendingChallenge(
  ctx: ChallengeContext
): Promise<PendingChallenge> {
  const pending = await pendingChallenge(ctx);
  if (!pending) {
    throw new APIError("UNAUTHORIZED", {
      ...CHALLENGE_ERRORS.INVALID_TWO_FACTOR_COOKIE,
    });
  }
  return pending;
}

/** The challenge's own wrong-answer budget (CHALLENGE_ATTEMPTS). */
export interface ChallengeAttempt {
  /** A wrong answer: one more against the budget. */
  recordFailure: () => Promise<void>;
  /** Nothing was checked: the budget stays as it was. */
  restore: () => Promise<void>;
}

/**
 * Takes the challenge's attempt counter (`2fa-attempts-<id>`) for one
 * answer, exactly as the twoFactor plugin's beginAttempt does: the record is
 * consumed, so parallel answers can't both be checked, and put back with the
 * new count afterwards. Over budget, the challenge ends.
 */
export async function beginChallengeAttempt(
  ctx: GenericEndpointContext,
  pending: PendingChallenge,
  allowed: number
): Promise<ChallengeAttempt> {
  const identifier = `2fa-attempts-${pending.id}`;
  const consumed = await ctx.context.internalAdapter
    .consumeVerificationValue(identifier)
    .catch(() => null);
  if (!consumed) {
    throw new APIError("UNAUTHORIZED", {
      ...CHALLENGE_ERRORS.INVALID_TWO_FACTOR_COOKIE,
    });
  }
  const parsed = Number(consumed.value);
  const attempts = Number.isInteger(parsed) && parsed >= 0 ? parsed : allowed;
  if (attempts >= allowed) {
    await ctx.context.internalAdapter.consumeVerificationValue(pending.id);
    expireCookie(ctx, ctx.context.createAuthCookie(TWO_FACTOR_COOKIE));
    throw new APIError("BAD_REQUEST", {
      ...CHALLENGE_ERRORS.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
    });
  }
  const rearm = async (count: number) => {
    await ctx.context.internalAdapter
      .createVerificationValue({
        value: `${count}`,
        identifier,
        expiresAt: pending.expiresAt,
      })
      .catch(() => undefined);
  };
  return {
    recordFailure: () => rearm(attempts + 1),
    restore: () => rearm(attempts),
  };
}

/**
 * Ends a challenge that was answered correctly, exactly as the twoFactor
 * plugin's verifyTwoFactor does after a right TOTP code: the challenge is
 * consumed (once), a session is made (honouring "don't remember me"), the
 * two_factor cookie is cleared and, when asked, this device is trusted for
 * the next 30 days.
 */
export async function finishChallenge(
  ctx: GenericEndpointContext,
  pending: PendingChallenge,
  { trustDevice }: { trustDevice: boolean }
) {
  const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
  const invalid = () => {
    expireCookie(ctx, twoFactorCookie);
    return new APIError("UNAUTHORIZED", {
      ...CHALLENGE_ERRORS.INVALID_TWO_FACTOR_COOKIE,
    });
  };
  const consumed = await ctx.context.internalAdapter.consumeVerificationValue(
    pending.id
  );
  if (!consumed || consumed.value !== pending.userId) throw invalid();
  const user = await ctx.context.internalAdapter.findUserById(pending.userId);
  if (!user) throw invalid();
  const dontRememberMe = await ctx.getSignedCookie(
    ctx.context.authCookies.dontRememberToken.name,
    ctx.context.secret
  );
  const session = await ctx.context.internalAdapter.createSession(
    pending.userId,
    !!dontRememberMe
  );
  if (!session) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "failed to create session",
      code: "FAILED_TO_CREATE_SESSION",
    });
  }
  await setSessionCookie(ctx, { session, user });
  expireCookie(ctx, twoFactorCookie);

  if (trustDevice) {
    const maxAge = trustDeviceMaxAge(ctx);
    const trustCookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE, {
      maxAge,
    });
    const identifier = `trust-device-${generateRandomString(32)}`;
    await ctx.context.internalAdapter.createVerificationValue({
      value: user.id,
      identifier,
      expiresAt: new Date(Date.now() + maxAge * 1000),
    });
    await ctx.setSignedCookie(
      trustCookie.name,
      `${await trustToken(ctx.context.secret, `${user.id}!${identifier}`)}!${identifier}`,
      ctx.context.secret,
      trustCookie.attributes
    );
    expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
  }
  return ctx.json({
    token: session.token,
    user: parseUserOutput(ctx.context.options, user),
  });
}
