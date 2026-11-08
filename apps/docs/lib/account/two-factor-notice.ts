/**
 * The notice emailed after a two-step verification change (turned on or off,
 * new backup codes, an authenticator app added or removed, turned off by
 * support, a backup code used). Pure; the sender is
 * ./two-factor-notice-server.tsx.
 */
import type {
  TwoFactorNoticeExtra,
  TwoFactorNoticeKind,
} from "@/lib/email/templates/two-factor-notice";
import type { NoticeDeliveryDeps } from "./email-change";

export type { TwoFactorNoticeExtra, TwoFactorNoticeKind };

const DESCRIPTIONS: Record<TwoFactorNoticeKind, string> = {
  on: "two-step verification turned on",
  off: "two-step verification turned off",
  "backup-codes": "new backup codes",
  "app-added": "authenticator app added",
  "app-removed": "authenticator app removed",
  "support-off": "two-step verification turned off by support",
  "backup-code-used": "a backup code was used",
};

/** What the notice says, in a few words (for the local dev log). */
export function describeTwoFactorNotice(
  kind: TwoFactorNoticeKind,
  extra: TwoFactorNoticeExtra = {},
): string {
  const parts = [DESCRIPTIONS[kind]];
  if (kind === "on" && extra.signedOutElsewhere) {
    parts.push("other sessions signed out");
  }
  if (kind === "backup-code-used") {
    parts[0] = `${DESCRIPTIONS[kind]} to ${extra.usedFor === "confirm" ? "confirm it's you" : "sign in"}`;
    if (typeof extra.codesLeft === "number") {
      parts.push(`${extra.codesLeft} left`);
    }
  }
  return parts.join(", ");
}

/**
 * Emails the notice where outbound delivery is on, writes it to the console
 * in local dev. Never throws: the change has happened, so a failed notice is
 * reported (and logged by the caller), never undone.
 */
export async function deliverTwoFactorNotice(
  {
    kind,
    email,
    extra,
  }: { kind: TwoFactorNoticeKind; email: string; extra?: TwoFactorNoticeExtra },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx security notice for ${email}: ${describeTwoFactorNotice(kind, extra)} (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
