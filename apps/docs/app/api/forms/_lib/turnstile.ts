// Cloudflare Turnstile server-side verification for public form submissions.
// Pure (secret and fetch are passed in) so it can be tested without network.

export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing-token" | "rejected" }
  /** Cloudflare unreachable or erroring: callers let the submission through */
  | { ok: false; reason: "unavailable" };

export async function verifyTurnstile({
  token,
  secret,
  ip,
  fetchImpl = fetch,
  timeoutMs = 5000,
}: {
  token: string | null | undefined;
  secret: string;
  ip: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TurnstileResult> {
  if (!token || token.length > 2048) {
    return { ok: false, reason: "missing-token" };
  }
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: "turnstile.http_error",
          status: response.status,
        }),
      );
      return { ok: false, reason: "unavailable" };
    }
    const data = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (data.success === true) return { ok: true };
    const codes = data["error-codes"] ?? [];
    // A wrong secret is our misconfiguration, not the visitor's fault.
    if (codes.includes("invalid-input-secret")) {
      console.error(JSON.stringify({ event: "turnstile.bad_secret" }));
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "rejected" };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "turnstile.unreachable",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ok: false, reason: "unavailable" };
  }
}
