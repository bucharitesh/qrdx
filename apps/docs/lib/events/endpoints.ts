import "server-only";

import { lookup } from "node:dns/promises";
import {
  database as db,
  webhookDelivery,
  webhookEndpoint,
} from "@repo/database";
import cuid from "cuid";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { outcomeValues, sendDelivery } from "./deliveries";
import type { PostResult } from "./http";
import { generateWebhookSecret, maskSecret } from "./signature";
import { endpointScopeWhere, invalidateSubscribers } from "./subscribers";
import {
  type DeliveryStatus,
  MAX_WEBHOOK_ENDPOINTS,
  PING_EVENT,
  WEBHOOK_EVENTS,
  type WebhookEnvelope,
  type WebhookEvent,
} from "./types";
import { checkWebhookUrl, isBlockedAddress } from "./url-safety";

export const webhookEventsSchema = z
  .array(z.enum(WEBHOOK_EVENTS))
  .min(1, "Pick at least one event")
  .max(WEBHOOK_EVENTS.length)
  .transform((events) => [...new Set(events)]);

export const webhookUrlSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const checked = checkWebhookUrl(value);
    if (!checked.ok) {
      ctx.addIssue({ code: "custom", message: checked.message });
      return z.NEVER;
    }
    return checked.url.toString();
  });

export interface WebhookEndpointView {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  secretPreview: string;
  createdAt: Date;
  createdBy: string;
  lastDelivery: {
    status: DeliveryStatus;
    event: string;
    createdAt: Date;
    lastError: string | null;
  } | null;
}

export interface WebhookDeliveryView {
  id: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  payload: Record<string, unknown>;
}

type EndpointRow = typeof webhookEndpoint.$inferSelect;

const notFound = () =>
  new HttpError(404, "NOT_FOUND", "Webhook endpoint not found.");

const planRequired = () =>
  new HttpError(
    402,
    "PLAN_REQUIRED",
    "Webhooks and Zapier/Make hooks are part of the Business plan.",
  );

const asEvents = (value: unknown): WebhookEvent[] =>
  Array.isArray(value)
    ? value.filter((event): event is WebhookEvent =>
        (WEBHOOK_EVENTS as readonly string[]).includes(event),
      )
    : [];

/** Owners and admins manage a team's webhooks; personal scope is always "owner". */
export const canManageWebhooks = (scope: ActiveScope) =>
  scope.role === "owner" || scope.role === "admin";

function assertManager(scope: ActiveScope) {
  if (!canManageWebhooks(scope)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners and admins can manage webhooks.",
    );
  }
}

export async function webhookPlan(
  scope: ActiveScope,
): Promise<{ plan: Plan; allowed: boolean }> {
  const plan = await getPlanForScope(scope);
  return { plan, allowed: getPlanLimits(plan).webhooks };
}

async function assertWebhooksAllowed(scope: ActiveScope) {
  if (!(await webhookPlan(scope)).allowed) throw planRequired();
}

/** Save-time DNS check (each connection re-checks it too). */
async function assertPublicHost(url: string) {
  const { hostname } = new URL(url);
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `${hostname} could not be resolved. Check the URL.`,
    );
  }
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isBlockedAddress(entry.address))
  ) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `${hostname} points to a private or reserved address.`,
    );
  }
}

function toView(
  row: EndpointRow,
  lastDelivery: WebhookEndpointView["lastDelivery"] = null,
): WebhookEndpointView {
  return {
    id: row.id,
    url: row.url,
    events: asEvents(row.events),
    active: row.active,
    secretPreview: maskSecret(row.secret),
    createdAt: row.createdAt,
    createdBy: row.userId,
    lastDelivery,
  };
}

async function findEndpoint(
  scope: ActiveScope,
  id: string,
): Promise<EndpointRow> {
  const [row] = await db
    .select()
    .from(webhookEndpoint)
    .where(and(eq(webhookEndpoint.id, id), endpointScopeWhere(scope)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

export async function listEndpoints(
  scope: ActiveScope,
): Promise<WebhookEndpointView[]> {
  const rows = await db
    .select()
    .from(webhookEndpoint)
    .where(endpointScopeWhere(scope))
    .orderBy(desc(webhookEndpoint.createdAt))
    .limit(MAX_WEBHOOK_ENDPOINTS * 2);
  if (rows.length === 0) return [];

  // Latest delivery per endpoint in one round trip.
  const latest = await db
    .selectDistinctOn([webhookDelivery.endpointId], {
      endpointId: webhookDelivery.endpointId,
      status: webhookDelivery.status,
      event: webhookDelivery.event,
      createdAt: webhookDelivery.createdAt,
      lastError: webhookDelivery.lastError,
    })
    .from(webhookDelivery)
    .where(
      inArray(
        webhookDelivery.endpointId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(webhookDelivery.endpointId, desc(webhookDelivery.createdAt));
  const byEndpoint = new Map(latest.map((row) => [row.endpointId, row]));

  return rows.map((row) => {
    const last = byEndpoint.get(row.id);
    return toView(
      row,
      last
        ? {
            status: last.status as DeliveryStatus,
            event: last.event,
            createdAt: last.createdAt,
            lastError: last.lastError,
          }
        : null,
    );
  });
}

export async function getEndpoint(
  scope: ActiveScope,
  id: string,
): Promise<WebhookEndpointView> {
  return toView(await findEndpoint(scope, id));
}

export async function createEndpoint(
  scope: ActiveScope,
  input: { url: string; events: WebhookEvent[] },
): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
  assertManager(scope);
  await assertWebhooksAllowed(scope);
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(webhookEndpoint)
    .where(endpointScopeWhere(scope));
  if (total >= MAX_WEBHOOK_ENDPOINTS) {
    throw new HttpError(
      403,
      "LIMIT_REACHED",
      `A workspace can have up to ${MAX_WEBHOOK_ENDPOINTS} webhook endpoints.`,
    );
  }
  await assertPublicHost(input.url);

  const secret = generateWebhookSecret();
  const [row] = await db
    .insert(webhookEndpoint)
    .values({
      id: cuid(),
      userId: scope.userId,
      organizationId: scope.organizationId,
      url: input.url,
      secret,
      events: input.events,
      active: true,
    })
    .returning();
  invalidateSubscribers(scope);
  return { endpoint: toView(row as EndpointRow), secret };
}

export async function updateEndpoint(
  scope: ActiveScope,
  id: string,
  patch: { url?: string; events?: WebhookEvent[]; active?: boolean },
): Promise<WebhookEndpointView> {
  assertManager(scope);
  const current = await findEndpoint(scope, id);
  // Turning an endpoint off is always allowed; changing or enabling it needs the plan.
  if (patch.active !== false || patch.url || patch.events) {
    await assertWebhooksAllowed(scope);
  }
  const values: Partial<typeof webhookEndpoint.$inferInsert> = {};
  if (patch.url !== undefined && patch.url !== current.url) {
    await assertPublicHost(patch.url);
    values.url = patch.url;
  }
  if (patch.events !== undefined) values.events = patch.events;
  if (patch.active !== undefined) values.active = patch.active;
  if (Object.keys(values).length === 0) return toView(current);

  const [row] = await db
    .update(webhookEndpoint)
    .set(values)
    .where(and(eq(webhookEndpoint.id, id), endpointScopeWhere(scope)))
    .returning();
  if (!row) throw notFound();
  invalidateSubscribers(scope);
  return toView(row);
}

/** Deleting is allowed on every plan; its deliveries go with it. */
export async function deleteEndpoint(
  scope: ActiveScope,
  id: string,
): Promise<{ id: string }> {
  assertManager(scope);
  const deleted = await db
    .delete(webhookEndpoint)
    .where(and(eq(webhookEndpoint.id, id), endpointScopeWhere(scope)))
    .returning({ id: webhookEndpoint.id });
  if (deleted.length === 0) throw notFound();
  invalidateSubscribers(scope);
  return { id };
}

export async function revealSecret(
  scope: ActiveScope,
  id: string,
): Promise<string> {
  assertManager(scope);
  return (await findEndpoint(scope, id)).secret;
}

/** New secret, effective immediately (the old one stops verifying). */
export async function rotateSecret(
  scope: ActiveScope,
  id: string,
): Promise<string> {
  assertManager(scope);
  await findEndpoint(scope, id);
  const secret = generateWebhookSecret();
  const [row] = await db
    .update(webhookEndpoint)
    .set({ secret })
    .where(and(eq(webhookEndpoint.id, id), endpointScopeWhere(scope)))
    .returning({ id: webhookEndpoint.id });
  if (!row) throw notFound();
  return secret;
}

export interface SendResult {
  deliveryId: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number;
}

const toSendResult = (deliveryId: string, result: PostResult): SendResult => ({
  deliveryId,
  ok: result.ok,
  status: result.status,
  error: result.ok ? null : result.error,
  durationMs: result.durationMs,
});

/** Sends a signed "ping" now and logs it like any delivery (no retries). */
export async function sendTestPing(
  scope: ActiveScope,
  id: string,
): Promise<SendResult> {
  assertManager(scope);
  await assertWebhooksAllowed(scope);
  const endpoint = await findEndpoint(scope, id);
  const now = new Date();
  const deliveryId = cuid();
  const payload: WebhookEnvelope = {
    id: `evt_${cuid()}`,
    type: PING_EVENT,
    created_at: now.toISOString(),
    data: {
      message: "Test delivery from QRdx. Your endpoint is reachable.",
      endpoint_id: endpoint.id,
    },
  };
  const delivery = {
    id: deliveryId,
    endpointId: endpoint.id,
    event: PING_EVENT,
    payload: payload as unknown as Record<string, unknown>,
  };
  const result = await sendDelivery(endpoint, delivery, now);
  await db.insert(webhookDelivery).values({
    ...delivery,
    attempts: 1,
    ...outcomeValues(1, result, now, { retry: false }),
  });
  return toSendResult(deliveryId, result);
}

/** Re-sends a logged delivery now (any status), counting one more attempt. */
export async function retryDelivery(
  scope: ActiveScope,
  deliveryId: string,
): Promise<SendResult> {
  assertManager(scope);
  await assertWebhooksAllowed(scope);
  const [row] = await db
    .select({ delivery: webhookDelivery, endpoint: webhookEndpoint })
    .from(webhookDelivery)
    .innerJoin(
      webhookEndpoint,
      eq(webhookEndpoint.id, webhookDelivery.endpointId),
    )
    .where(and(eq(webhookDelivery.id, deliveryId), endpointScopeWhere(scope)))
    .limit(1);
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Delivery not found.");
  }
  const result = await sendDelivery(row.endpoint, row.delivery);
  const attempts = row.delivery.attempts + 1;
  await db
    .update(webhookDelivery)
    .set({
      attempts: sql`${webhookDelivery.attempts} + 1`,
      // A pending delivery keeps its automatic retries; a finished one doesn't restart them.
      ...outcomeValues(attempts, result, new Date(), {
        retry: row.delivery.status === "pending",
      }),
    })
    .where(eq(webhookDelivery.id, deliveryId));
  return toSendResult(deliveryId, result);
}

export async function listDeliveries(
  scope: ActiveScope,
  endpointId: string,
  { status, limit = 50 }: { status?: DeliveryStatus; limit?: number } = {},
): Promise<WebhookDeliveryView[]> {
  await findEndpoint(scope, endpointId);
  const rows = await db
    .select()
    .from(webhookDelivery)
    .where(
      and(
        eq(webhookDelivery.endpointId, endpointId),
        status ? eq(webhookDelivery.status, status) : undefined,
      ),
    )
    .orderBy(desc(webhookDelivery.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    event: row.event,
    status: row.status as DeliveryStatus,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    payload: row.payload,
  }));
}
