import "server-only";

import {
  database as db,
  webhookDelivery,
  webhookEndpoint,
} from "@repo/database";
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { type PostResult, postJson } from "./http";
import { signatureHeader } from "./signature";
import {
  MAX_DELIVERY_ATTEMPTS,
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "./types";

const MINUTE_MS = 60_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * MINUTE_MS;
// A claimed delivery is retried after this if the worker dies mid-send.
const CLAIM_LEASE = sql`now() + interval '5 minutes'`;
const CONCURRENCY = 8;
/** Finished deliveries are kept this long for the delivery log. */
export const DELIVERY_RETENTION_DAYS = 30;

export type DeliveryRow = typeof webhookDelivery.$inferSelect;
type EndpointRow = typeof webhookEndpoint.$inferSelect;

/**
 * Wait before the next try after `attempts` failed tries: 1 min, 4 min,
 * 16 min, ~1 h, ~4 h, ~17 h, then 24 h (±10% jitter so retries spread out).
 */
export function retryDelayMs(
  attempts: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(
    MINUTE_MS * 4 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  );
  return Math.round(base * (0.9 + random() * 0.2));
}

/** One signed POST of a stored delivery. */
export function sendDelivery(
  endpoint: Pick<EndpointRow, "url" | "secret">,
  delivery: Pick<DeliveryRow, "id" | "event" | "payload">,
  now: Date = new Date(),
): Promise<PostResult> {
  const body = JSON.stringify(delivery.payload);
  const { header, timestamp } = signatureHeader(endpoint.secret, body, now);
  return postJson(endpoint.url, body, {
    [WEBHOOK_EVENT_HEADER]: delivery.event,
    [WEBHOOK_DELIVERY_HEADER]: delivery.id,
    [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
    [WEBHOOK_SIGNATURE_HEADER]: header,
  });
}

/** Status after an attempt; `attempts` already counts it. */
export function outcomeValues(
  attempts: number,
  result: PostResult,
  now: Date = new Date(),
  { retry = true }: { retry?: boolean } = {},
): Pick<DeliveryRow, "status" | "lastError" | "nextAttemptAt"> {
  if (result.ok) {
    return { status: "succeeded", lastError: null, nextAttemptAt: null };
  }
  const exhausted = !retry || attempts >= MAX_DELIVERY_ATTEMPTS;
  return {
    status: exhausted ? "failed" : "pending",
    lastError: result.error.slice(0, 500),
    nextAttemptAt: exhausted
      ? null
      : new Date(now.getTime() + retryDelayMs(attempts)),
  };
}

/**
 * Claims due pending deliveries (attempts + 1, short lease) in one statement;
 * SKIP LOCKED keeps concurrent workers off the same rows.
 */
export function claimDueDeliveries({
  limit,
  ids,
  endpointIds,
  firstAttemptOnly = false,
}: {
  limit: number;
  ids?: string[];
  endpointIds?: string[];
  firstAttemptOnly?: boolean;
}): Promise<DeliveryRow[]> {
  const due = and(
    eq(webhookDelivery.status, "pending"),
    lte(webhookDelivery.nextAttemptAt, sql`now()`),
    ids ? inArray(webhookDelivery.id, ids) : undefined,
    endpointIds ? inArray(webhookDelivery.endpointId, endpointIds) : undefined,
    firstAttemptOnly ? eq(webhookDelivery.attempts, 0) : undefined,
  );
  const candidates = db
    .select({ id: webhookDelivery.id })
    .from(webhookDelivery)
    .where(due)
    .orderBy(asc(webhookDelivery.nextAttemptAt))
    .limit(limit)
    .for("update", { skipLocked: true });

  return db
    .update(webhookDelivery)
    .set({
      attempts: sql`${webhookDelivery.attempts} + 1`,
      nextAttemptAt: CLAIM_LEASE,
    })
    .where(and(inArray(webhookDelivery.id, candidates), due))
    .returning();
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const item = items[next++] as T;
        await run(item);
      }
    })(),
  );
  await Promise.all(workers);
}

export interface ProcessSummary {
  succeeded: number;
  retrying: number;
  failed: number;
}

/** Sends claimed deliveries and stores each outcome. Never throws. */
export async function processClaimed(
  rows: DeliveryRow[],
): Promise<ProcessSummary> {
  const summary: ProcessSummary = { succeeded: 0, retrying: 0, failed: 0 };
  if (rows.length === 0) return summary;

  const endpointIds = [...new Set(rows.map((row) => row.endpointId))];
  const endpoints = new Map(
    (
      await db
        .select()
        .from(webhookEndpoint)
        .where(inArray(webhookEndpoint.id, endpointIds))
    ).map((endpoint) => [endpoint.id, endpoint]),
  );
  const allowed = new Map<string, Promise<boolean>>();
  const webhooksAllowed = (endpoint: EndpointRow) => {
    const key = endpoint.organizationId ?? `user:${endpoint.userId}`;
    let check = allowed.get(key);
    if (!check) {
      check = getPlanForScope(endpoint)
        .then((plan) => getPlanLimits(plan).webhooks)
        .catch(() => true);
      allowed.set(key, check);
    }
    return check;
  };

  await mapLimit(rows, CONCURRENCY, async (row) => {
    try {
      const endpoint = endpoints.get(row.endpointId);
      let result: PostResult;
      let retry = true;
      if (!endpoint?.active) {
        result = {
          ok: false,
          status: null,
          error: "Endpoint is disabled",
          durationMs: 0,
        };
        retry = false;
      } else if (!(await webhooksAllowed(endpoint))) {
        result = {
          ok: false,
          status: null,
          error: "Not sent: the workspace's plan no longer includes webhooks",
          durationMs: 0,
        };
        retry = false;
      } else {
        result = await sendDelivery(endpoint, row);
      }
      const values = outcomeValues(row.attempts, result, new Date(), {
        retry,
      });
      await db
        .update(webhookDelivery)
        .set(values)
        .where(eq(webhookDelivery.id, row.id));
      if (values.status === "succeeded") summary.succeeded++;
      else if (values.status === "failed") summary.failed++;
      else summary.retrying++;
    } catch (error) {
      // The lease expires and the worker picks the row up again.
      console.error(
        JSON.stringify({
          event: "webhook.process_failed",
          deliveryId: row.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
  return summary;
}

/** First attempt right after enqueueing (the cron worker handles retries). */
export async function deliverNow(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const rows = await claimDueDeliveries({
      limit: ids.length,
      ids,
      firstAttemptOnly: true,
    });
    await processClaimed(rows);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "webhook.deliver_now_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/** Cron worker: drains due deliveries within a time budget. */
export async function runDeliveryWorker({
  budgetMs = 40_000,
  batchSize = 25,
  maxBatches = 20,
}: {
  budgetMs?: number;
  batchSize?: number;
  maxBatches?: number;
} = {}): Promise<ProcessSummary & { claimed: number }> {
  const started = Date.now();
  const total = { claimed: 0, succeeded: 0, retrying: 0, failed: 0 };
  for (let batch = 0; batch < maxBatches; batch++) {
    if (Date.now() - started > budgetMs) break;
    const rows = await claimDueDeliveries({ limit: batchSize });
    if (rows.length === 0) break;
    total.claimed += rows.length;
    const summary = await processClaimed(rows);
    total.succeeded += summary.succeeded;
    total.retrying += summary.retrying;
    total.failed += summary.failed;
    if (rows.length < batchSize) break;
  }
  return total;
}

/** Deletes finished deliveries older than the retention window, in chunks. */
export async function pruneDeliveries(
  now: Date = new Date(),
  chunk = 1000,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - DELIVERY_RETENTION_DAYS * 24 * 60 * MINUTE_MS,
  );
  const old = db
    .select({ id: webhookDelivery.id })
    .from(webhookDelivery)
    .where(
      and(
        inArray(webhookDelivery.status, ["succeeded", "failed"]),
        lt(webhookDelivery.createdAt, cutoff),
      ),
    )
    .limit(chunk);
  const deleted = await db
    .delete(webhookDelivery)
    .where(inArray(webhookDelivery.id, old))
    .returning({ id: webhookDelivery.id });
  return deleted.length;
}
