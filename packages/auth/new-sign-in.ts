import { createHash, randomBytes } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { CHALLENGE_CONTINUE_PATH } from "./sign-in-challenge-rules";
import { signInMethodForPath } from "./sign-in-method";

// New sign-in alerts. After a sign-in has really finished (any way in, and
// after the second step when there is one), the browser is looked up among
// the account's known devices; one the account hasn't seen gets an email,
// sent by the app (registerNewSignInNotifier, like the sign-in code sender in
// ./email-otp.ts: this package has no email stack).
//
// "Finished" means this response sets a new session cookie that is still set
// once every earlier after-hook has run. The challenge (./sign-in-challenge.ts)
// swaps a 2FA user's new session for the two_factor cookie and clears
// `newSession`, so a challenged sign-in is seen only when the second step
// completes. A request that re-issues the session it came with (a refresh,
// switching workspace) isn't a sign-in. Server-side auth.api calls (the
// app's 2FA settings swap the session after their own checks) can't set the
// device cookie and aren't sign-ins either: skipped.
//
// A browser is known by a random 32-byte cookie (qrdx_device, HttpOnly,
// SameSite=Lax, 400 days); only its SHA-256 is stored (known_device,
// packages/database/manual-sql/0023_known_device.sql). No alert:
// - for a browser the account has signed in from before;
// - when the account has no known devices yet: a brand-new account, and
//   every existing account's first sign-in after this shipped, is recorded
//   silently, so nobody is emailed just because the feature arrived.
//
// It never blocks or fails a sign-in: errors are logged and the sign-in goes
// on. It must run after the challenge's hook, so it's registered after it.

export const DEVICE_COOKIE = "qrdx_device";
// Browsers cap cookie lifetimes at 400 days.
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
const DEVICE_ID = /^[0-9a-f]{64}$/;
const MODEL = "knownDevice";
// The lastLoginMethod plugin's cookie (its default name, as in ./server.ts):
// set on the response that started the sign-in, so a challenged sign-in's
// first step is still known when the second step finishes it.
const LAST_METHOD_COOKIE = "better-auth.last_used_login_method";

/** What finished a challenged sign-in. */
export type SecondStep = "totp" | "backup-code" | "passkey";

// The challenge's endpoints that finish it (./sign-in-challenge-rules.ts and
// the passkey second step in ./sign-in-challenge.ts).
const SECOND_STEPS: Record<string, SecondStep> = {
  "/two-factor/verify-totp": "totp",
  "/two-factor/verify-backup-code": "backup-code",
  "/two-factor/passkey/verify": "passkey",
};
// A trusted device skipped the second step.
const COMPLETION_WITHOUT_STEP = [CHALLENGE_CONTINUE_PATH];

export interface NewSignIn {
  user: { id: string; email: string; name: string | null };
  /**
   * How they signed in: "email-otp", "passkey", "sso", or a social provider's
   * id ("google", "github"); null when unknown.
   */
  method: string | null;
  /** The second step that finished it, when there was one */
  secondStep: SecondStep | null;
  /** The request's headers: the app reads device, place and address from them */
  headers: Headers;
}

/** Emails the alert. Throw when it couldn't be sent; it's logged. */
export type NewSignInNotifier = (signIn: NewSignIn) => Promise<void> | void;

// On globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the notifier the app registered.
const NOTIFIER = Symbol.for("@repo/auth/new-sign-in-notifier");
type NotifierSlot = Record<symbol, NewSignInNotifier | undefined>;

export function registerNewSignInNotifier(notifier: NewSignInNotifier): void {
  (globalThis as unknown as NotifierSlot)[NOTIFIER] = notifier;
}

// No ids, emails or addresses in these logs.
function log(
  level: "info" | "warn" | "error",
  fields: Record<string, unknown>
) {
  console[level](JSON.stringify({ event: "auth.new_sign_in", ...fields }));
}

/** An error's name and message, without a failed query's parameters (ids). */
function describeError(error: unknown) {
  if (!(error instanceof Error)) return { error: "unknown" };
  return {
    error: error.name,
    message: error.message.split(/\bparams:/)[0].slice(0, 300),
  };
}

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

interface NewSession {
  session: { token: string };
  user: { id: string; email?: string | null; name?: string | null };
}

interface KnownDevice {
  id: string;
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/**
 * Whether the response still sets this session's cookie after the earlier
 * hooks: the challenge replaces it with an expired one.
 */
function sessionCookieSet(ctx: HookContext, token: string): boolean {
  const name = ctx.context.authCookies.sessionToken.name;
  const lines = ctx.context.responseHeaders?.getSetCookie?.() ?? [];
  const last = lines.filter((line) => line.startsWith(`${name}=`)).at(-1);
  if (!last) return false;
  const [pair = "", ...attributes] = last.split(";");
  if (attributes.some((part) => /^\s*max-age=0\s*$/i.test(part))) return false;
  let value = pair.slice(name.length + 1);
  try {
    value = decodeURIComponent(value);
  } catch {
    return false;
  }
  // Signed: "<token>.<signature>"
  return value.startsWith(`${token}.`);
}

/** The session token cookie the request came with, if any (signed). */
async function requestSessionToken(ctx: HookContext): Promise<string | null> {
  return (
    (await ctx.getSignedCookie(
      ctx.context.authCookies.sessionToken.name,
      ctx.context.secret
    )) || null
  );
}

/** How the sign-in started: from its path, else the cookie its start set. */
function signInMethod(ctx: HookContext, path: string): string | null {
  const fromPath = signInMethodForPath(path);
  if (fromPath) return fromPath;
  if (path.startsWith("/callback/")) {
    const id = (ctx.params as { id?: unknown } | undefined)?.id;
    return typeof id === "string" ? id : (path.split("/").pop() ?? null);
  }
  if (path in SECOND_STEPS || COMPLETION_WITHOUT_STEP.includes(path)) {
    return ctx.getCookie(LAST_METHOD_COOKIE) ?? null;
  }
  return null;
}

/** The cookie on this browser, or a new one. Null: can't tell (see below). */
function deviceId(ctx: HookContext): { id: string; isNew: boolean } | null {
  const existing = ctx.getCookie(DEVICE_COOKIE);
  if (existing && DEVICE_ID.test(existing)) {
    return { id: existing, isNew: false };
  }
  // A cross-site POST (a SAML identity provider posting back) doesn't carry
  // SameSite=Lax cookies, so a missing cookie says nothing about the browser.
  // Minting one would replace the real one and alert every time.
  if (
    ctx.request?.method === "POST" &&
    ctx.request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return null;
  }
  return { id: randomBytes(32).toString("hex"), isNew: true };
}

async function recordSignIn(ctx: HookContext): Promise<void> {
  const data = ctx.context.newSession as NewSession | null;
  if (!data) return;
  if (!(ctx.request instanceof Request)) return;
  const returned = ctx.context.returned;
  if (isAPIError(returned) && returned.statusCode >= 400) return;
  if (!sessionCookieSet(ctx, data.session.token)) return;
  if ((await requestSessionToken(ctx)) === data.session.token) return;

  const device = deviceId(ctx);
  if (!device) {
    log("info", { outcome: "no-device-cookie" });
    return;
  }
  // Every finished sign-in renews the cookie's 400 days.
  ctx.setCookie(DEVICE_COOKIE, device.id, {
    httpOnly: true,
    // Secure wherever the session cookie is (https, production).
    secure: ctx.context.authCookies.sessionToken.attributes.secure,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });

  const userId = data.user.id;
  const deviceHash = sha256(device.id);
  const userAgent =
    ctx.request.headers.get("user-agent")?.slice(0, 512) || null;
  const now = new Date();
  const adapter = ctx.context.adapter;
  const find = (where: { field: string; value: string }[]) =>
    adapter.findOne<KnownDevice>({ model: MODEL, where });
  const thisDevice = [
    { field: "userId", value: userId },
    { field: "deviceHash", value: deviceHash },
  ];

  const known = device.isNew ? null : await find(thisDevice);
  if (known) {
    await adapter.update({
      model: MODEL,
      where: [{ field: "id", value: known.id }],
      update: { lastSeenAt: now, userAgent },
    });
    log("info", { outcome: "known-device" });
    return;
  }

  const anyKnown = await find([{ field: "userId", value: userId }]);
  try {
    await adapter.create({
      model: MODEL,
      data: { userId, deviceHash, createdAt: now, lastSeenAt: now, userAgent },
    });
  } catch (error) {
    // Two sign-ins from this browser at once: the other one recorded it.
    if (await find(thisDevice)) return;
    throw error;
  }
  if (!anyKnown) {
    log("info", { outcome: "first-device" });
    return;
  }

  const notifier = (globalThis as unknown as NotifierSlot)[NOTIFIER];
  if (!notifier) {
    log("error", { outcome: "no-notifier" });
    return;
  }
  const user =
    typeof data.user.email === "string"
      ? data.user
      : await ctx.context.internalAdapter.findUserById(userId);
  if (!user?.email) {
    log("error", { outcome: "no-email" });
    return;
  }
  const path = ctx.path ?? "";
  try {
    await notifier({
      user: { id: userId, email: user.email, name: user.name ?? null },
      method: signInMethod(ctx, path),
      secondStep: SECOND_STEPS[path] ?? null,
      headers: new Headers(ctx.request.headers),
    });
  } catch (error) {
    log("error", { outcome: "not-sent", ...describeError(error) });
    return;
  }
  log("info", { outcome: "new-device" });
}

export function newSignIn() {
  return {
    id: "qrdx-new-sign-in",
    schema: {
      knownDevice: {
        fields: {
          userId: {
            type: "string",
            required: true,
            input: false,
            references: { model: "user", field: "id", onDelete: "cascade" },
          },
          deviceHash: { type: "string", required: true, input: false },
          createdAt: { type: "date", required: true, input: false },
          lastSeenAt: { type: "date", required: true, input: false },
          userAgent: { type: "string", required: false, input: false },
        },
      },
    },
    hooks: {
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            try {
              await recordSignIn(ctx);
            } catch (error) {
              log("error", { outcome: "failed", ...describeError(error) });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
