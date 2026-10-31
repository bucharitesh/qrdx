import "server-only";

import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { env } from "@/lib/env";

/**
 * Transactional email through Resend. Without RESEND_API_KEY + EMAIL_FROM
 * every send is skipped and logged, so callers must offer a fallback (e.g. a
 * copyable invite link). `sendEmail` never throws unless `throwOnError`.
 */
export const isEmailConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

let client: Resend | null = null;

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  /** A template from lib/email/templates (wrapped in EmailLayout) */
  react: ReactElement;
  replyTo?: string;
  /** Adds one-click List-Unsubscribe headers (digests, alerts) */
  unsubscribeUrl?: string;
  /** Resend drops repeats with the same key for 24 hours (safe retries) */
  idempotencyKey?: string;
  /** Resend tags: ASCII letters, numbers, _ and - only */
  tags?: { name: string; value: string }[];
  /** Throw on failure instead of resolving `{ sent: false }` */
  throwOnError?: boolean;
}

export type SendEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "not-configured" | "failed"; error?: string };

function log(
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  // Recipient addresses stay out of logs.
  console[level](JSON.stringify({ event, ...fields }));
}

/** HTML and plain-text bodies of a template. */
export async function renderEmail(
  react: ReactElement,
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);
  return { html, text };
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
  unsubscribeUrl,
  idempotencyKey,
  tags,
  throwOnError = false,
}: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = Array.isArray(to) ? to : [to];
  const fields = { subject, recipients: recipients.length };

  if (!(isEmailConfigured && env.RESEND_API_KEY && env.EMAIL_FROM)) {
    log("info", "email.skipped", { ...fields, reason: "not-configured" });
    if (throwOnError) throw new Error("Email is not configured");
    return { sent: false, reason: "not-configured" };
  }
  if (!isOutboundDeliveryAllowed()) {
    log("info", "email.skipped", { ...fields, reason: "outside-production" });
    return { sent: false, reason: "not-configured" };
  }

  try {
    const { html, text } = await renderEmail(react);
    client ??= new Resend(env.RESEND_API_KEY);
    const { data, error } = await client.emails.send(
      {
        from: env.EMAIL_FROM,
        to: recipients,
        subject,
        html,
        text,
        replyTo,
        tags,
        headers: unsubscribeUrl
          ? {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    if (error || !data) {
      throw new Error(error?.message ?? "Resend returned no email id");
    }
    log("info", "email.sent", { ...fields, id: data.id });
    return { sent: true, id: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", "email.failed", { ...fields, error: message });
    if (throwOnError) throw error;
    return { sent: false, reason: "failed", error: message };
  }
}
