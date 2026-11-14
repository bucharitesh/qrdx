import { createHash } from "node:crypto";

/**
 * Where an emailed code goes (sign-in codes, and the code that confirms a new
 * email address). Pure so the rules are testable; the real dependencies are
 * wired in ./sign-in-code.tsx and ./email-change-code.tsx.
 *
 * - Delivery allowed (production deployment): emailed through Resend.
 * - Not allowed, outside production (local dev): written to the server console.
 * - Not allowed, NODE_ENV=production (preview, localhost build): the request
 *   fails, because codes are never logged in production.
 * - NODE_ENV=test: never emailed, even with QRDX_ALLOW_DEV_DELIVERY=1.
 */
export interface SignInCodeDeliveryDeps {
  nodeEnv: string | undefined;
  /** isOutboundDeliveryAllowed() */
  deliveryAllowed: boolean;
  /** Emails the code; resolves `{ sent: false }` when it wasn't sent */
  send: () => Promise<{ sent: boolean; reason?: string }>;
  /** Server console */
  log: (line: string) => void;
}

export async function deliverSignInCode(
  { email, otp }: { email: string; otp: string },
  deps: SignInCodeDeliveryDeps,
  /** What the code is, for the dev log line and errors */
  label = "sign-in code",
): Promise<"emailed" | "logged"> {
  if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
    const result = await deps.send();
    if (!result.sent) {
      throw new Error(
        `${label} email not sent (${result.reason ?? "unknown"})`,
      );
    }
    return "emailed";
  }
  if (deps.nodeEnv === "production") {
    throw new Error(`${label} email is off for this deployment`);
  }
  deps.log(
    `[dev only] QRdx ${label} for ${email}: ${otp} (not emailed: delivery is off outside production)`,
  );
  return "logged";
}

/** Rate-limit key for an address: hashed, so addresses never sit in Redis keys. */
export function addressKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

interface AddressLimiter {
  limit: (key: string) => Promise<{ success: boolean }>;
}

/**
 * Each code allows 3 guesses, so the per-address limits are what bound
 * guessing over time: a short burst window plus a daily cap. Every limiter
 * counts the request; any one of them can refuse it.
 */
export async function addressMayRequestCode(
  key: string,
  limiters: readonly AddressLimiter[],
): Promise<boolean> {
  const results = await Promise.all(
    limiters.map((limiter) => limiter.limit(key)),
  );
  return results.every((result) => result.success);
}
