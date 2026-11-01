/**
 * Where a sign-in code goes. Pure so the rules are testable; the real
 * dependencies are wired in ./sign-in-code.tsx.
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
): Promise<"emailed" | "logged"> {
  if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
    const result = await deps.send();
    if (!result.sent) {
      throw new Error(
        `Sign-in code email not sent (${result.reason ?? "unknown"})`,
      );
    }
    return "emailed";
  }
  if (deps.nodeEnv === "production") {
    throw new Error("Sign-in code email is off for this deployment");
  }
  deps.log(
    `[dev only] QRdx sign-in code for ${email}: ${otp} (not emailed: delivery is off outside production)`,
  );
  return "logged";
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
