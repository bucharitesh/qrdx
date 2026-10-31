import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { database as db, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { compare } from "bcryptjs";
import cuid from "cuid";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { getClientIp } from "@/lib/request-guards";
import type { Awaitable, RedirectCode } from "./code";
import { escapeHtml, neutralPage } from "./pages";

/**
 * Step 1 of /q/<slug>: may this scan go through right now?
 * Inputs: password_hash, starts_at, expires_at, scan_limit, paused_at,
 * fallback_url (see RedirectCode).
 *
 * - "allow": continue to routing.
 * - "gate": the route answers with `gateResponse`. Gate forms POST back to the
 *   same short link (/q/<slug>, or /<slug> on a custom domain); the route runs
 *   this pipeline again for POSTs, `gateResponse` checks the password and
 *   answers with a signed unlock cookie (scoped to the slug, also read by
 *   /p/<slug>) plus a redirect to where the scan was going.
 * - "ended": the route redirects to `fallbackUrl`, or shows a neutral page for
 *   `reason` without any QRdx promotion (Never-Hostage Guarantee).
 *
 * The rules never look at the plan: setting them needs Pro, but a downgrade
 * never ends or gates a code (actions/code-lifecycle.ts).
 * Errors thrown here fail closed (the route shows "unavailable").
 */
export type EndedReason = "not-started" | "expired" | "scan-limit" | "paused";

export type LifecycleResult =
  | { action: "allow" }
  | { action: "gate"; reason: "password" }
  | { action: "ended"; fallbackUrl: string | null; reason: EndedReason };

export type LifecycleCode = Pick<
  RedirectCode,
  | "id"
  | "slug"
  | "passwordHash"
  | "startsAt"
  | "expiresAt"
  | "scanLimit"
  | "scanCount"
  | "pausedAt"
  | "fallbackUrl"
>;

/** Columns `enforcePageLifecycle` loads for /p/<slug>. */
const lifecycleColumns = {
  id: qrCode.id,
  slug: qrCode.slug,
  passwordHash: qrCode.passwordHash,
  startsAt: qrCode.startsAt,
  expiresAt: qrCode.expiresAt,
  scanLimit: qrCode.scanLimit,
  scanCount: qrCode.scanCount,
  pausedAt: qrCode.pausedAt,
  fallbackUrl: qrCode.fallbackUrl,
};

/** The owner's fallback, only if it is still an absolute http(s) URL. */
function safeFallback(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * The lifecycle rules, in order: paused, not started, expired, scan limit
 * reached, password. `scanSlack` lets a page view through when the scan that
 * opened it was the last one allowed (its count is already stored).
 */
export function lifecycleState(
  code: LifecycleCode,
  {
    now = new Date(),
    unlocked = false,
    scanSlack = 0,
  }: { now?: Date; unlocked?: boolean; scanSlack?: number } = {},
): LifecycleResult {
  const ended = (reason: EndedReason): LifecycleResult => ({
    action: "ended",
    reason,
    // Before the start date visitors are told to come back later instead.
    fallbackUrl:
      reason === "not-started" ? null : safeFallback(code.fallbackUrl),
  });

  if (code.pausedAt) return ended("paused");
  if (code.startsAt && now < code.startsAt) return ended("not-started");
  if (code.expiresAt && now >= code.expiresAt) return ended("expired");
  if (code.scanLimit !== null && code.scanCount >= code.scanLimit + scanSlack) {
    return ended("scan-limit");
  }
  if (code.passwordHash && !unlocked) {
    return { action: "gate", reason: "password" };
  }
  return { action: "allow" };
}

// ─── Unlock cookie ───────────────────────────────────────────────────────────

const UNLOCK_COOKIE_PREFIX = "qrdx_unlock_";
/** How long a correct password keeps a code unlocked in that browser. */
export const UNLOCK_TTL_SECONDS = 6 * 60 * 60;

export const unlockCookieName = (slug: string) =>
  `${UNLOCK_COOKIE_PREFIX}${slug}`;

let unlockKey: Buffer | null = null;

function getUnlockKey(): Buffer {
  if (!unlockKey) {
    const secret = process.env.BETTER_AUTH_SECRET;
    unlockKey = secret
      ? createHash("sha256").update(`qrdx:unlock:${secret}`).digest()
      : // Without a secret, unlocks last until the server restarts.
        randomBytes(32);
  }
  return unlockKey;
}

function sign(code: LifecycleCode, expiresAt: number): Buffer {
  // The password hash is part of the signature, so changing the password
  // locks out every browser that unlocked the old one.
  return createHmac("sha256", getUnlockKey())
    .update(`${code.id}\n${code.slug}\n${expiresAt}\n${code.passwordHash}`)
    .digest();
}

/** Cookie value `<expiry seconds>.<signature>` for a code. */
export function createUnlockToken(
  code: LifecycleCode,
  now: Date = new Date(),
): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + UNLOCK_TTL_SECONDS;
  return `${expiresAt}.${sign(code, expiresAt).toString("base64url")}`;
}

export function verifyUnlockToken(
  code: LifecycleCode,
  token: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!(token && code.passwordHash)) return false;
  const match = /^(\d{1,12})\.([\w-]{43})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (expiresAt <= nowSeconds || expiresAt > nowSeconds + UNLOCK_TTL_SECONDS) {
    return false;
  }
  const expected = sign(code, expiresAt);
  const actual = Buffer.from(match[2] as string, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}

// ─── Short link (/q/<slug>) ──────────────────────────────────────────────────

export function evaluateLifecycle(
  code: RedirectCode,
  request: Request,
): Awaitable<LifecycleResult> {
  const now = new Date();
  const unlocked = code.passwordHash
    ? verifyUnlockToken(
        code,
        readCookie(request.headers.get("cookie"), unlockCookieName(code.slug)),
        now,
      )
    : true;
  return lifecycleState(code, { now, unlocked });
}

const MAX_PASSWORD_LENGTH = 128;
const MAX_FORM_BYTES = 4096;

// Per visitor per code, plus per visitor overall: stops guessing, not people.
const unlockCodeLimiter = createRateLimiter({
  limiter: slidingWindow(10, "300 s"),
});
const unlockIpLimiter = createRateLimiter({
  limiter: slidingWindow(40, "300 s"),
});

async function isUnlockRateLimited(code: LifecycleCode, request: Request) {
  const ip = getClientIp(request);
  try {
    const [perCode, perIp] = await Promise.all([
      unlockCodeLimiter.limit(`unlock:${code.id}:${ip}`),
      unlockIpLimiter.limit(`unlock:ip:${ip}`),
    ]);
    return !(perCode.success && perIp.success);
  } catch {
    return false;
  }
}

function gatePage(
  code: LifecycleCode,
  { status = 200, error }: { status?: number; error?: string } = {},
): Response {
  const errorHtml = error
    ? `<p class="error" id="password-error" role="alert">${escapeHtml(error)}</p>`
    : "";
  const describedBy = error ? ' aria-describedby="password-error"' : "";
  return neutralPage({
    status,
    title: "This QR code is password protected",
    slug: code.slug,
    body: `<p>Enter the password you were given to continue.</p>
<form method="post">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" maxlength="${MAX_PASSWORD_LENGTH}" required autofocus${describedBy}>
${errorHtml}
<button type="submit">Continue</button>
</form>`,
  });
}

/** The urlencoded `password` field, reading at most MAX_FORM_BYTES. */
async function readPassword(request: Request): Promise<string | null> {
  if (
    !request.body ||
    Number(request.headers.get("content-length") ?? 0) > MAX_FORM_BYTES
  ) {
    return null;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_FORM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return new URLSearchParams(body).get("password") || null;
}

/** Where the unlocked visitor goes: the hosted page or the routed destination. */
async function unlockedLocation(
  code: RedirectCode,
  request: Request,
): Promise<string> {
  if (code.kind === "page") {
    // Relative, so the visitor stays on the host they scanned (custom domains too).
    return `/p/${encodeURIComponent(code.slug)}`;
  }
  try {
    // The scan was recorded by the GET that showed the gate; going straight to
    // the destination keeps it from being counted twice.
    const { resolveDestination } = await import("./routing");
    return await resolveDestination(code, request, {
      scanId: cuid(),
      now: new Date(),
    });
  } catch (error) {
    console.error("Short link routing failed after unlock:", error);
    return code.destinationUrl;
  }
}

function isSecureRequest(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
  );
}

/** Response for a gated code: the password form, or its POST being checked. */
export async function gateResponse(
  code: RedirectCode,
  request: Request,
  _reason: "password",
): Promise<Response> {
  if (request.method !== "POST" || !code.passwordHash) {
    return gatePage(code);
  }
  if (await isUnlockRateLimited(code, request)) {
    return gatePage(code, {
      status: 429,
      error: "Too many attempts. Please wait a few minutes and try again.",
    });
  }

  const password = await readPassword(request);
  if (!password) {
    return gatePage(code, { status: 400, error: "Enter the password." });
  }
  const correct =
    password.length <= MAX_PASSWORD_LENGTH &&
    (await compare(password, code.passwordHash));
  if (!correct) {
    return gatePage(code, {
      status: 401,
      error: "That password isn't right. Please try again.",
    });
  }

  const cookie = [
    `${unlockCookieName(code.slug)}=${createUnlockToken(code)}`,
    "Path=/",
    `Max-Age=${UNLOCK_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(isSecureRequest(request) ? ["Secure"] : []),
  ].join("; ");
  return new Response(null, {
    status: 303,
    headers: {
      Location: await unlockedLocation(code, request),
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

// ─── Hosted pages (/p/<slug>) ────────────────────────────────────────────────

/**
 * Verdict for a view of a hosted page's content (reads the unlock cookie).
 * Route handlers that serve page content (vCard, calendar files, ...) should
 * answer 403 unless it is "allow".
 */
export async function checkPageLifecycle(
  code: LifecycleCode,
): Promise<LifecycleResult> {
  const unlocked = code.passwordHash
    ? verifyUnlockToken(
        code,
        (await cookies()).get(unlockCookieName(code.slug))?.value,
      )
    : true;
  return lifecycleState(code, { unlocked, scanSlack: 1 });
}

/**
 * Call before rendering /p/<slug>: lets the page through, or redirects to the
 * owner's fallback URL, or to the short link, which shows the password form or
 * the "ended" page. Pass the loaded code, or its slug to load it; missing
 * codes are left to the page (404).
 */
export async function enforcePageLifecycle(
  codeOrSlug: LifecycleCode | string,
): Promise<void> {
  let code: LifecycleCode | undefined;
  if (typeof codeOrSlug === "string") {
    [code] = await db
      .select(lifecycleColumns)
      .from(qrCode)
      .where(eq(qrCode.slug, codeOrSlug))
      .limit(1);
  } else {
    code = codeOrSlug;
  }
  if (!code) return;

  const result = await checkPageLifecycle(code);
  if (result.action === "allow") return;

  // Loaded here so the rest of this module also runs outside Next (tests).
  const { redirect } = await import("next/navigation");
  if (result.action === "ended" && result.fallbackUrl) {
    redirect(result.fallbackUrl);
  }
  const onCustomDomain = (await headers()).get(CUSTOM_DOMAIN_HEADER);
  const path = encodeURIComponent(code.slug);
  redirect(onCustomDomain ? `/${path}` : `/q/${path}`);
}
