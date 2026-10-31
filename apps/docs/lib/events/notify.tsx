import "server-only";

import { database as db, organization, user } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { sendEmail } from "@/lib/email/send";
import { CodeActivityEmail } from "@/lib/email/templates/code-activity";
import { FirstScanEmail } from "@/lib/email/templates/first-scan";
import { FormSubmissionEmail } from "@/lib/email/templates/form-submission";
import { codeLabel, formatCount } from "@/lib/email/templates/parts";
import { ScanMilestoneEmail } from "@/lib/email/templates/scan-milestone";
import { baseUrl } from "@/lib/metadata";
import { postJson } from "./http";
import type { EventScope, NotificationTarget } from "./subscribers";
import type {
  CodeEventData,
  EventDataMap,
  FormSubmittedData,
  NotificationEvent,
  ScanMilestoneData,
  WebhookEnvelope,
} from "./types";
import { unsubscribeUrl } from "./unsubscribe";

/** Events that reach email / Slack / Discord targets (digest is separate). */
export type AlertEvent = Exclude<NotificationEvent, "digest.weekly">;

export const isAlertEvent = (type: string): type is AlertEvent =>
  type === "scan.milestone" ||
  type === "form.submitted" ||
  type === "code.created" ||
  type === "code.updated";

// A busy form must not flood an inbox or channel: past this, alerts for the
// target are skipped for the hour (the weekly digest still counts them).
const alertLimiter = createRateLimiter({ limiter: slidingWindow(30, "1 h") });

async function withinAlertLimit(targetId: string, event: string) {
  try {
    return (await alertLimiter.limit(`notify:${targetId}:${event}`)).success;
  } catch {
    return true;
  }
}

const CHANGE_LABELS: Record<string, string> = {
  destination_url: "Destination",
  title: "Title",
  style: "Design",
  domain_id: "Short link domain",
};

const absolute = (path: string) => new URL(path, baseUrl.origin).toString();
const codeUrl = (id: string) =>
  absolute(`/dashboard/codes/${encodeURIComponent(id)}`);
const responsesUrl = (pageId: string) =>
  absolute(`/dashboard/pages/${encodeURIComponent(pageId)}/responses`);

async function teamName(organizationId: string): Promise<string | null> {
  const [team] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return team?.name ?? null;
}

/** For sentences: "your personal workspace" / "the Acme team". */
export async function workspaceLabel(scope: EventScope): Promise<string> {
  if (!scope.organizationId) return "your personal workspace";
  const name = await teamName(scope.organizationId);
  return name ? `the ${name} team` : "your team";
}

/** For headings: "Personal workspace" / "Acme". */
export async function workspaceTitle(scope: EventScope): Promise<string> {
  if (!scope.organizationId) return "Personal workspace";
  return (await teamName(scope.organizationId)) ?? "Your team";
}

async function userName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  return row?.name ?? null;
}

interface Alert {
  subject: string;
  /** Chat message (plain text; links appended) */
  text: string;
  url: string;
  email: (unsubscribe: string) => ReactElement;
}

function joinParts(parts: (string | null | undefined)[], separator: string) {
  return parts.filter(Boolean).join(separator) || null;
}

function milestoneAlert(data: ScanMilestoneData, workspace: string): Alert {
  const url = codeUrl(data.code.id);
  const label = codeLabel(data.code);
  if (data.milestone === 1) {
    const location = joinParts([data.scan.city, data.scan.country], ", ");
    const device = joinParts([data.scan.os, data.scan.browser], " · ");
    return {
      subject: `${label} got its first scan`,
      text: `${label} got its first scan${location ? ` (${location})` : ""}.`,
      url,
      email: (unsubscribe) => (
        <FirstScanEmail
          analyticsUrl={url}
          code={data.code}
          device={device}
          location={location}
          scannedAt={data.scan.scanned_at}
          unsubscribeUrl={unsubscribe}
          workspaceName={workspace}
        />
      ),
    };
  }
  const count = formatCount(data.milestone);
  return {
    subject: `${label} reached ${count} scans`,
    text: `${label} reached ${count} scans.`,
    url,
    email: (unsubscribe) => (
      <ScanMilestoneEmail
        analyticsUrl={url}
        code={data.code}
        milestone={data.milestone}
        unsubscribeUrl={unsubscribe}
        workspaceName={workspace}
      />
    ),
  };
}

function formAlert(data: FormSubmittedData, workspace: string): Alert {
  const url = responsesUrl(data.page.id);
  const page = data.page.title?.trim()
    ? `“${data.page.title.trim()}”`
    : "your page";
  const preview = data.fields
    .slice(0, 5)
    .map(
      (field) => `${field.label || field.name}: ${field.value.slice(0, 200)}`,
    )
    .join("\n");
  return {
    subject: `New form response on ${page}`,
    text: `New form response on ${page}${preview ? `\n${preview}` : ""}`,
    url,
    email: (unsubscribe) => (
      <FormSubmissionEmail
        fields={data.fields}
        pageTitle={data.page.title}
        responsesUrl={url}
        submittedAt={data.submitted_at}
        unsubscribeUrl={unsubscribe}
        workspaceName={workspace}
      />
    ),
  };
}

function codeAlert(
  type: "code.created" | "code.updated",
  data: CodeEventData,
  workspace: string,
  actorName: string | null,
): Alert {
  const url = codeUrl(data.code.id);
  const label = codeLabel(data.code);
  const changes = (data.changes ?? []).map(
    (field) => CHANGE_LABELS[field] ?? field,
  );
  const who = actorName?.trim() || "Someone";
  const created = type === "code.created";
  return {
    subject: created ? `New code: ${label}` : `${label} was changed`,
    text: created
      ? `${who} created ${label} → ${data.code.destination_url}`
      : `${who} changed ${label}${changes.length ? ` (${changes.join(", ")})` : ""}.`,
    url,
    email: (unsubscribe) => (
      <CodeActivityEmail
        actorName={actorName}
        changes={changes}
        code={{
          title: data.code.title,
          slug: data.code.slug,
          shortLink: data.code.short_link,
          destination: data.code.destination_url,
        }}
        codeUrl={url}
        kind={created ? "created" : "updated"}
        unsubscribeUrl={unsubscribe}
        workspaceName={workspace}
      />
    ),
  };
}

/** Slack treats &, < and > as control characters (mentions, links). */
const slackEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function slackPayload(alert: Pick<Alert, "text" | "url">) {
  return {
    text: `${slackEscape(alert.text)}\n<${alert.url}|Open in QRdx>`,
    unfurl_links: false,
    unfurl_media: false,
  };
}

export function discordPayload(alert: Pick<Alert, "text" | "url">) {
  const content = `${alert.text}\n${alert.url}`;
  return {
    username: "QRdx",
    content: content.length > 1900 ? `${content.slice(0, 1900)}…` : content,
    // Visitor-typed text must never ping @everyone or roles.
    allowed_mentions: { parse: [] },
  };
}

export async function postChatMessage(
  channel: "slack" | "discord",
  url: string,
  alert: Pick<Alert, "text" | "url">,
) {
  const body = JSON.stringify(
    channel === "slack" ? slackPayload(alert) : discordPayload(alert),
  );
  return postJson(url, body, {}, 5000);
}

/** Sends one event's alerts to the targets that asked for it. Never throws. */
export async function notifyTargets<T extends AlertEvent>(
  envelope: WebhookEnvelope<EventDataMap[T]> & { type: T },
  targets: NotificationTarget[],
  scope: EventScope,
): Promise<void> {
  if (targets.length === 0) return;
  try {
    const workspace = await workspaceLabel(scope);
    let alert: Alert;
    if (envelope.type === "scan.milestone") {
      alert = milestoneAlert(envelope.data as ScanMilestoneData, workspace);
    } else if (envelope.type === "form.submitted") {
      alert = formAlert(envelope.data as FormSubmittedData, workspace);
    } else {
      const data = envelope.data as CodeEventData;
      alert = codeAlert(
        envelope.type as "code.created" | "code.updated",
        data,
        workspace,
        await userName(data.actor_id),
      );
    }

    await Promise.allSettled(
      targets.map(async (target) => {
        if (!(await withinAlertLimit(target.id, envelope.type))) return;
        if (target.channel === "email") {
          const unsubscribe = unsubscribeUrl(target.id, envelope.type);
          await sendEmail({
            to: target.target,
            subject: alert.subject,
            react: alert.email(unsubscribe),
            unsubscribeUrl: unsubscribe,
            idempotencyKey: `${envelope.id}:${target.id}`,
            tags: [
              { name: "category", value: envelope.type.replace(".", "_") },
            ],
          });
          return;
        }
        const result = await postChatMessage(
          target.channel,
          target.target,
          alert,
        );
        if (!result.ok) {
          console.error(
            JSON.stringify({
              event: "notification.chat_failed",
              channel: target.channel,
              targetId: target.id,
              error: result.error,
            }),
          );
        }
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "notification.failed",
        type: envelope.type,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
