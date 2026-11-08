import "server-only";

import type { BackupCodeNotifier } from "@repo/auth/sign-in-challenge";
import { after } from "next/server";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  type BackupCodeUsedFor,
  TwoFactorNoticeEmail,
  twoFactorNoticeSubject,
} from "@/lib/email/templates/two-factor-notice";
import {
  currentRequestDetails,
  requestDetails,
} from "@/lib/security/request-details";
import {
  deliverTwoFactorNotice,
  type TwoFactorNoticeExtra,
  type TwoFactorNoticeKind,
} from "./two-factor-notice";
import { countBackupCodes } from "./two-factor-server";

/** An error for the log: its message without addresses, cut short. */
const loggable = (error: unknown) =>
  error instanceof Error
    ? error.message
        .replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, "<address>")
        .slice(0, 300)
    : "unknown";

/**
 * Tells the account's address about a two-step verification change, with the
 * device, place and time of the request that made it (read here from the
 * current request, or from `headers` when the caller has them). Best effort
 * and never throws; a notice that wasn't sent is logged loudly (no address
 * in the log).
 */
export async function sendTwoFactorNotice(
  kind: TwoFactorNoticeKind,
  email: string,
  { extra, headers }: { extra?: TwoFactorNoticeExtra; headers?: Headers } = {},
): Promise<void> {
  try {
    const request = headers
      ? requestDetails(headers)
      : await currentRequestDetails();
    // Support's change: their device and address aren't the account's business.
    const details =
      kind === "support-off" ? { ...request, actor: "QRdx support" } : request;
    const outcome = await deliverTwoFactorNotice(
      { kind, email, extra },
      {
        nodeEnv: process.env.NODE_ENV,
        deliveryAllowed: isOutboundDeliveryAllowed(),
        log: (line) => console.info(line),
        send: () =>
          sendEmail({
            to: email,
            subject: twoFactorNoticeSubject(kind),
            react: (
              <TwoFactorNoticeEmail
                details={details}
                extra={extra}
                kind={kind}
              />
            ),
            tags: [{ name: "category", value: "two_factor" }],
          }),
      },
    );
    const level = outcome === "not-sent" ? "error" : "info";
    console[level](
      JSON.stringify({ event: "account.two_factor_notice", kind, outcome }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "account.two_factor_notice",
        kind,
        outcome: "failed",
        error: loggable(error),
      }),
    );
  }
}

/**
 * A backup code was used (to finish a sign-in, or to confirm it's you):
 * emails the account's address with how many codes are left. Best effort and
 * never throws; it never holds up or undoes what the code was used for.
 */
export async function sendBackupCodeUsedNotice({
  userId,
  email,
  usedFor,
  headers,
}: {
  userId: string;
  email: string;
  usedFor: BackupCodeUsedFor;
  headers?: Headers;
}): Promise<void> {
  let codesLeft: number | null = null;
  try {
    codesLeft = await countBackupCodes(userId);
  } catch (error) {
    // Still sent, without the count.
    console.error(
      JSON.stringify({
        event: "account.backup_code_notice",
        outcome: "count-failed",
        error: loggable(error),
      }),
    );
  }
  await sendTwoFactorNotice("backup-code-used", email, {
    extra: { usedFor, codesLeft },
    headers,
  });
}

/**
 * Registered with @repo/auth in app/api/auth/[...all]/route.ts: a backup
 * code finished someone's sign-in. Sends after the response, so it never
 * slows a sign-in down; outside a request (no `after`), straight away.
 */
export const notifyBackupCodeUsed: BackupCodeNotifier = ({ user, headers }) => {
  const send = () =>
    sendBackupCodeUsedNotice({
      userId: user.id,
      email: user.email,
      usedFor: "sign-in",
      headers,
    });
  try {
    after(send);
  } catch {
    return send();
  }
};
