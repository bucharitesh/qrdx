/**
 * The alert emailed when a browser or device signs in to an account for the
 * first time (packages/auth/new-sign-in.ts decides when). Pure; the sender
 * is ./new-sign-in-notice-server.tsx.
 */
import type { SecondStep } from "@repo/auth/new-sign-in";
import { isReservedEmailAddress } from "@/lib/email/reserved-address";
import type { NoticeDeliveryDeps } from "./email-change";

const METHODS: Record<string, string> = {
  "email-otp": "Email code",
  google: "Google",
  github: "GitHub",
  passkey: "Passkey",
  sso: "Single sign-on",
};

const SECOND_STEPS: Record<SecondStep, string> = {
  totp: "an authenticator code",
  "backup-code": "a backup code",
  passkey: "a passkey",
};

/** "Google", "Email code, then a passkey"; null when the way in is unknown. */
export function signInMethodLabel(
  method: string | null,
  secondStep: SecondStep | null,
): string | null {
  const first = method ? (METHODS[method] ?? null) : null;
  if (!first) return null;
  return secondStep ? `${first}, then ${SECOND_STEPS[secondStep]}` : first;
}

// Test and e2e accounts use reserved addresses (@qrdx.test) and sign in
// from fresh browsers all the time; they're never emailed.
export { isReservedEmailAddress } from "@/lib/email/reserved-address";

/**
 * Emails the alert where outbound delivery is on, writes it to the console in
 * local dev. Reserved test addresses are never emailed ("skipped"). Never
 * throws: the sign-in has happened, so a failed alert is reported (and
 * logged by the caller).
 */
export async function deliverNewSignInNotice(
  { email, summary }: { email: string; summary: string },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "skipped" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      if (isReservedEmailAddress(email)) return "skipped";
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx new sign-in alert for ${email}: ${summary} (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
