import "server-only";

import { database as db, webhookDelivery } from "@repo/database";
import cuid from "cuid";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { getPlanLimits } from "@/lib/plans";
import { shortLinkUrl } from "@/lib/short-links";
import { claimDueDeliveries, deliverNow, processClaimed } from "./deliveries";
import { isAlertEvent, notifyTargets } from "./notify";
import {
  type EventScope,
  loadSubscribers,
  type Subscribers,
} from "./subscribers";
import {
  type CodeEventData,
  type CodeSummary,
  type EventDataMap,
  type EventType,
  type FormField,
  type FormSubmittedData,
  isScanMilestone,
  SCAN_BATCH_MAX_SCANS,
  SCAN_BATCH_WINDOW_SECONDS,
  type ScanBatchData,
  type ScanSummary,
  type WebhookEnvelope,
} from "./types";

// emitEvent(type, data, scope) fans an event out to the workspace's webhook
// endpoints (stored in webhook_delivery, first attempt sent right away,
// retries by the cron worker) and its email / Slack / Discord targets.
//
// scan.created is batched per endpoint: the first scan opens a delivery that
// stays open for SCAN_BATCH_WINDOW_SECONDS; later scans are appended to it
// (up to SCAN_BATCH_MAX_SCANS, then only `count` grows). The batch is sent by
// the next scan after the window closes or by the cron worker, whichever
// comes first. Busy codes therefore cost one small UPDATE per scan per
// endpoint, and receivers get at most one request per minute.

export type { EventScope } from "./subscribers";

function log(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ event, ...fields }));
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function envelopeFor<T extends EventType>(
  type: T,
  data: EventDataMap[T],
  now: Date,
): WebhookEnvelope<EventDataMap[T]> & { type: T } {
  return {
    id: `evt_${cuid()}`,
    type,
    created_at: now.toISOString(),
    data,
  };
}

async function enqueue(
  endpointIds: string[],
  envelope: WebhookEnvelope<unknown>,
): Promise<void> {
  const rows = endpointIds.map((endpointId) => ({
    id: cuid(),
    endpointId,
    event: envelope.type,
    payload: envelope as unknown as Record<string, unknown>,
    status: "pending",
    attempts: 0,
    nextAttemptAt: sql`now()`,
  }));
  await db.insert(webhookDelivery).values(rows);
  await deliverNow(rows.map((row) => row.id));
}

const BATCH_OPEN_FOR = sql.raw(
  `now() + interval '${SCAN_BATCH_WINDOW_SECONDS} seconds'`,
);

/** Adds the scan to the endpoint's open batch; false when none is open. */
async function appendToOpenBatch(
  endpointId: string,
  scan: ScanSummary,
): Promise<boolean> {
  const open = and(
    eq(webhookDelivery.endpointId, endpointId),
    eq(webhookDelivery.event, "scan.created"),
    eq(webhookDelivery.status, "pending"),
    eq(webhookDelivery.attempts, 0),
    gt(webhookDelivery.nextAttemptAt, sql`now()`),
  );
  const batch = db
    .select({ id: webhookDelivery.id })
    .from(webhookDelivery)
    .where(open)
    .orderBy(asc(webhookDelivery.createdAt))
    .limit(1)
    .for("update");
  const payload = sql`${webhookDelivery.payload}::jsonb`;
  const scans = sql`coalesce(${payload} #> '{data,scans}', '[]'::jsonb)`;
  const updated = await db
    .update(webhookDelivery)
    .set({
      payload: sql`jsonb_set(
        jsonb_set(${payload}, '{data,count}', to_jsonb(coalesce((${payload} #>> '{data,count}')::int, 0) + 1)),
        '{data,scans}',
        case when jsonb_array_length(${scans}) < ${SCAN_BATCH_MAX_SCANS}
          then ${scans} || jsonb_build_array(${JSON.stringify(scan)}::jsonb)
          else ${scans} end
      )::json`,
    })
    // `open` again: a batch claimed meanwhile is left alone (Postgres re-checks it).
    .where(and(inArray(webhookDelivery.id, batch), open))
    .returning({ id: webhookDelivery.id });
  return updated.length > 0;
}

async function batchScan(endpointId: string, scan: ScanSummary, now: Date) {
  if (await appendToOpenBatch(endpointId, scan)) return;

  const id = cuid();
  const data: ScanBatchData = {
    window_started_at: now.toISOString(),
    window_seconds: SCAN_BATCH_WINDOW_SECONDS,
    count: 1,
    scans: [scan],
  };
  await db.insert(webhookDelivery).values({
    id,
    endpointId,
    event: "scan.created",
    payload: {
      id: `evt_${id}`,
      type: "scan.created",
      created_at: now.toISOString(),
      data,
    },
    status: "pending",
    attempts: 0,
    nextAttemptAt: BATCH_OPEN_FOR,
  });
  // A new window means the previous one has closed: send what's due now
  // instead of waiting for the cron worker.
  await processClaimed(
    await claimDueDeliveries({ limit: 5, endpointIds: [endpointId] }),
  );
}

/**
 * Fans an event out to webhooks and notification targets. Never throws:
 * failures are logged, and a lost event never affects the caller.
 */
export async function emitEvent<T extends EventType>(
  type: T,
  data: EventDataMap[T],
  scope: EventScope,
  {
    now = new Date(),
    subscribers,
  }: { now?: Date; subscribers?: Subscribers | null } = {},
): Promise<void> {
  try {
    const subs =
      subscribers === undefined
        ? await loadSubscribers(scope, { cached: type.startsWith("scan.") })
        : subscribers;
    if (!subs) return;
    const limits = getPlanLimits(subs.plan);
    const tasks: Promise<unknown>[] = [];

    const endpointIds = limits.webhooks
      ? subs.endpoints
          .filter((endpoint) => endpoint.events.includes(type))
          .map((endpoint) => endpoint.id)
      : [];

    if (type === "scan.created") {
      for (const endpointId of endpointIds) {
        tasks.push(batchScan(endpointId, data as ScanSummary, now));
      }
    } else {
      const envelope = envelopeFor(type, data, now);
      if (endpointIds.length > 0) {
        tasks.push(enqueue(endpointIds, envelope));
      }
      if (isAlertEvent(type)) {
        const targets = subs.targets.filter(
          (target) =>
            target.events.includes(type) &&
            (target.channel === "email" ? limits.emailAlerts : limits.webhooks),
        );
        if (targets.length > 0) {
          tasks.push(notifyTargets(envelope as never, targets, scope));
        }
      }
    }

    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === "rejected") {
        log("event.fanout_failed", {
          type,
          error: errorMessage(result.reason),
        });
      }
    }
  } catch (error) {
    log("event.emit_failed", { type, error: errorMessage(error) });
  }
}

/**
 * emitEvent after the response is sent (server actions, route handlers);
 * outside a request it just runs detached.
 */
export function emitEventInBackground<T extends EventType>(
  type: T,
  data: EventDataMap[T],
  scope: EventScope,
): void {
  runInBackground(() => emitEvent(type, data, scope));
}

function runInBackground(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

// ─── Payload builders ────────────────────────────────────────────────────────

/** Accepts a qr-codes QrCodeView (or anything shaped like it). */
export interface CodeLike {
  id: string;
  slug: string;
  title: string | null;
  shortLink?: string;
  destinationUrl: string;
  status?: string;
  scanCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function codeSummary(code: CodeLike): CodeSummary {
  return {
    id: code.id,
    slug: code.slug,
    title: code.title,
    short_link: code.shortLink ?? shortLinkUrl(code.slug),
    destination_url: code.destinationUrl,
    status: code.status ?? "active",
    scan_count: code.scanCount,
    created_at: code.createdAt.toISOString(),
    updated_at: code.updatedAt.toISOString(),
  };
}

const toSnake = (field: string) =>
  field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** code.created for each new code (in the background). */
export function emitCodesCreated(
  scope: EventScope & { actorId?: string },
  codes: CodeLike[],
): void {
  if (codes.length === 0) return;
  runInBackground(async () => {
    // Bulk creation (API batches, CSV import): look subscribers up once.
    const subscribers = await loadSubscribers(scope).catch(() => undefined);
    for (const code of codes) {
      const data: CodeEventData = {
        code: codeSummary(code),
        actor_id: scope.actorId ?? scope.userId,
      };
      await emitEvent("code.created", data, scope, { subscribers });
    }
  });
}

/** code.updated with the changed field names, e.g. ["destinationUrl"]. */
export function emitCodeUpdated(
  scope: EventScope & { actorId?: string },
  code: CodeLike,
  changedFields: string[],
): void {
  if (changedFields.length === 0) return;
  const data: CodeEventData = {
    code: codeSummary(code),
    changes: changedFields.map(toSnake),
    actor_id: scope.actorId ?? scope.userId,
  };
  emitEventInBackground("code.updated", data, scope);
}

const MAX_FORM_FIELDS = 100;
const MAX_FORM_VALUE = 5000;

/** form.submitted (call from the public form submit route after storing). */
export function emitFormSubmitted(
  scope: EventScope,
  input: {
    responseId: string;
    page: { id: string; title: string | null };
    code?: { id: string; slug: string } | null;
    fields: FormField[];
    submittedAt?: Date;
  },
): void {
  const data: FormSubmittedData = {
    response_id: input.responseId,
    page: input.page,
    code: input.code ?? null,
    fields: input.fields.slice(0, MAX_FORM_FIELDS).map((field) => ({
      name: field.name.slice(0, 100),
      label: field.label.slice(0, 200),
      value: field.value.slice(0, MAX_FORM_VALUE),
    })),
    submitted_at: (input.submittedAt ?? new Date()).toISOString(),
  };
  emitEventInBackground("form.submitted", data, scope);
  // HubSpot / Mailchimp streams (lib/data-connections): sent right away
  triggerIntegrationSyncs(scope, "responses");
}

/**
 * Starts the lib/data-connections streams without loading that module (and
 * the provider clients it pulls in) on every import of this one.
 */
function triggerIntegrationSyncs(
  scope: { userId: string; organizationId: string | null },
  stream: "scans" | "responses",
): void {
  import("@/lib/data-connections/sync")
    .then((sync) => sync.triggerIntegrationSyncs(scope, stream))
    .catch((error: unknown) => {
      console.error("[events] integration sync failed to start", error);
    });
}

// ─── Scans (called by lib/scans.ts recordScan) ───────────────────────────────

export interface RecordedScan {
  id: string;
  scannedAt: Date;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  referer: string | null;
}

export interface ScannedCode {
  id: string;
  userId: string;
  organizationId: string | null;
  slug: string;
  title: string | null;
  /** After this scan */
  scanCount: number;
}

export function scanSummary(
  scan: RecordedScan,
  code: ScannedCode,
): ScanSummary {
  return {
    scan_id: scan.id,
    code: { id: code.id, slug: code.slug, title: code.title },
    scanned_at: scan.scannedAt.toISOString(),
    country: scan.country,
    region: scan.region,
    city: scan.city,
    device_type: scan.deviceType,
    os: scan.os,
    browser: scan.browser,
    referer: scan.referer,
  };
}

/**
 * scan.created (batched) and, on milestone counts, scan.milestone. Each scan
 * sees a unique post-increment count, so a milestone fires exactly once.
 */
export async function emitScanRecorded(
  scan: RecordedScan,
  code: ScannedCode,
): Promise<void> {
  try {
    const scope = { userId: code.userId, organizationId: code.organizationId };
    // Google Sheets "keep in sync": batched, at most every 5 min per sheet
    triggerIntegrationSyncs(scope, "scans");
    const subscribers = await loadSubscribers(scope, { cached: true });
    if (!subscribers) return;
    const summary = scanSummary(scan, code);
    const tasks = [
      emitEvent("scan.created", summary, scope, {
        now: scan.scannedAt,
        subscribers,
      }),
    ];
    if (isScanMilestone(code.scanCount)) {
      tasks.push(
        emitEvent(
          "scan.milestone",
          {
            milestone: code.scanCount,
            code: {
              id: code.id,
              slug: code.slug,
              title: code.title,
              scan_count: code.scanCount,
            },
            scan: summary,
          },
          scope,
          { now: scan.scannedAt, subscribers },
        ),
      );
    }
    await Promise.all(tasks);
  } catch (error) {
    log("event.scan_emit_failed", { error: errorMessage(error) });
  }
}
