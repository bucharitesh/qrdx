import "server-only";

import { env } from "@/lib/env";

/**
 * Cloudflare Turnstile verification for public forms. Off unless both
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set; then the
 * widget's token (form field `cf-turnstile-response`) is required.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

export const TURNSTILE_FIELD = "cf-turnstile-response";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

export function isTurnstileConfigured(): boolean {
  return Boolean(
    env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
}

/** Site key for the widget, or null when Turnstile is off. */
export function turnstileSiteKey(): string | null {
  return isTurnstileConfigured()
    ? (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null)
    : null;
}

/**
 * True when the token is valid, or Turnstile is off. If Cloudflare can't be
 * reached the form is let through (logged): rate limits still apply.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!isTurnstileConfigured() || !secret) return true;
  if (!token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn("[safety] Turnstile verify failed:", {
        status: response.status,
      });
      return true;
    }
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch (error) {
    console.warn("[safety] Turnstile verify failed:", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return true;
  }
}
