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
import type { EmailIntl } from "@/lib/i18n/email";
import { emailIntlForAddress } from "@/lib/i18n/email-locale";
import { baseUrl } from "@/lib/metadata";
import { workspaceLink } from "@/lib/workspace-paths";
import { workspaceSlug } from "@/lib/workspaces";
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
// Links name the workspace (/dashboard/<slug>/...), so they open the right
// one for every member; without a slug they go through /dashboard?to=.
const codeUrl = (slug: string | null, id: string) =>
  absolute(workspaceLink(slug, `/codes/${encodeURIComponent(id)}`));
const responsesUrl = (slug: string | null, pageId: string) =>
  absolute(
    workspaceLink(slug, `/pages/${encodeURIComponent(pageId)}/responses`),
  );

async function teamName(organizationId: string): Promise<string | null> {
  const [team] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return team?.name ?? null;
}

/** For sentences: "Acme" (every member reads the same alert). */
export async function workspaceLabel(scope: EventScope): Promise<string> {
  if (!scope.organizationId) return "your workspace";
  return (await teamName(scope.organizationId)) ?? "your workspace";
}

/** For headings: "Acme". */
export async function workspaceTitle(scope: EventScope): Promise<string> {
  if (!scope.organizationId) return "Your workspace";
  return (await teamName(scope.organizationId)) ?? "Your workspace";
}

/** The slug for links into the event's workspace (null before workspaces). */
export async function eventWorkspaceSlug(
  scope: EventScope,
): Promise<string | null> {
  return scope.organizationId ? workspaceSlug(scope.organizationId) : null;
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
  /** The email, in the recipient's language (lib/i18n/email-locale.ts). */
  email: (
    unsubscribe: string,
    intl: EmailIntl,
  ) => { subject: string; react: ReactElement };
}

function joinParts(parts: (string | null | undefined)[], separator: string) {
  return parts.filter(Boolean).join(separator) || null;
}

function milestoneAlert(
  data: ScanMilestoneData,
  workspace: string,
  slug: string | null,
): Alert {
  const url = codeUrl(slug, data.code.id);
  const label = codeLabel(data.code);
  if (data.milestone === 1) {
    const location = joinParts([data.scan.city, data.scan.country], ", ");
    const device = joinParts([data.scan.os, data.scan.browser], " · ");
    return {
      subject: `${label} got its first scan`,
      text: `${label} got its first scan${location ? ` (${location})` : ""}.`,
      url,
      email: (unsubscribe, intl) => ({
        subject: intl.t("firstScan.subject", { code: label }),
        react: (
          <FirstScanEmail
            analyticsUrl={url}
            code={data.code}
            device={device}
            intl={intl}
            location={location}
            scannedAt={data.scan.scanned_at}
            unsubscribeUrl={unsubscribe}
            workspaceName={workspace}
          />
        ),
      }),
    };
  }
  const count = formatCount(data.milestone);
  return {
    subject: `${label} reached ${count} scans`,
    text: `${label} reached ${count} scans.`,
    url,
    email: (unsubscribe, intl) => ({
      subject: intl.t("scanMilestone.reached", {
        code: label,
        count: data.milestone,
      }),
      react: (
        <ScanMilestoneEmail
          analyticsUrl={url}
          code={data.code}
          intl={intl}
          milestone={data.milestone}
          unsubscribeUrl={unsubscribe}
          workspaceName={workspace}
        />
      ),
    }),
  };
}

function formAlert(
  data: FormSubmittedData,
  workspace: string,
  slug: string | null,
): Alert {
  const url = responsesUrl(slug, data.page.id);
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
    email: (unsubscribe, intl) => ({
      subject: intl.t("formSubmission.subject", {
        hasTitle: data.page.title?.trim() ? "yes" : "no",
        title: data.page.title?.trim() ?? "",
      }),
      react: (
        <FormSubmissionEmail
          fields={data.fields}
          intl={intl}
          pageTitle={data.page.title}
          responsesUrl={url}
          submittedAt={data.submitted_at}
          unsubscribeUrl={unsubscribe}
          workspaceName={workspace}
        />
      ),
    }),
  };
}

function codeAlert(
  type: "code.created" | "code.updated",
  data: CodeEventData,
  workspace: string,
  slug: string | null,
  actorName: string | null,
): Alert {
  const url = codeUrl(slug, data.code.id);
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
    email: (unsubscribe, intl) => ({
      subject: intl.t(
        created
          ? "codeActivity.created.heading"
          : "codeActivity.updated.heading",
        { code: label },
      ),
      react: (
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
          intl={intl}
          kind={created ? "created" : "updated"}
          unsubscribeUrl={unsubscribe}
          workspaceName={workspace}
        />
      ),
    }),
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
    const [workspace, slug] = await Promise.all([
      workspaceLabel(scope),
      eventWorkspaceSlug(scope),
    ]);
    let alert: Alert;
    if (envelope.type === "scan.milestone") {
      alert = milestoneAlert(
        envelope.data as ScanMilestoneData,
        workspace,
        slug,
      );
    } else if (envelope.type === "form.submitted") {
      alert = formAlert(envelope.data as FormSubmittedData, workspace, slug);
    } else {
      const data = envelope.data as CodeEventData;
      alert = codeAlert(
        envelope.type as "code.created" | "code.updated",
        data,
        workspace,
        slug,
        await userName(data.actor_id),
      );
    }

    await Promise.allSettled(
      targets.map(async (target) => {
        if (!(await withinAlertLimit(target.id, envelope.type))) return;
        if (target.channel === "email") {
          const unsubscribe = unsubscribeUrl(target.id, envelope.type);
          // The account with this address picks the language, else English.
          const { subject, react } = alert.email(
            unsubscribe,
            await emailIntlForAddress(target.target),
          );
          await sendEmail({
            to: target.target,
            subject,
            react,
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
