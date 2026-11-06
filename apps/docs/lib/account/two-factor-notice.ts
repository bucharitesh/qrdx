/**
 * The notice emailed after a two-step verification change (turned on or off,
 * new backup codes, turned off by support). Pure; the sender is
 * ./two-factor-notice-server.tsx.
 */
import type { TwoFactorNoticeKind } from "@/lib/email/templates/two-factor-notice";
import type { NoticeDeliveryDeps } from "./email-change";

export type { TwoFactorNoticeKind };

const DESCRIPTIONS: Record<TwoFactorNoticeKind, string> = {
  on: "two-step verification turned on",
  off: "two-step verification turned off",
  "backup-codes": "new backup codes",
  "support-off": "two-step verification turned off by support",
};

/**
 * Emails the notice where outbound delivery is on, writes it to the console
 * in local dev. Never throws: the change has happened, so a failed notice is
 * reported (and logged by the caller), never undone.
 */
export async function deliverTwoFactorNotice(
  { kind, email }: { kind: TwoFactorNoticeKind; email: string },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx security notice for ${email}: ${DESCRIPTIONS[kind]} (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
