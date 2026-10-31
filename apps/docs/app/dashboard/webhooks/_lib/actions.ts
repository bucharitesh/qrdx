"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import {
  createEndpoint,
  deleteEndpoint,
  retryDelivery,
  revealSecret,
  rotateSecret,
  type SendResult,
  sendTestPing,
  updateEndpoint,
  type WebhookEndpointView,
  webhookEventsSchema,
  webhookUrlSchema,
} from "@/lib/events/endpoints";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type WebhookActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: boolean };

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});
// Test pings and retries make outbound requests: keep them rarer.
const sendLimiter = createRateLimiter({ limiter: slidingWindow(10, "60 s") });

const idSchema = z.object({ id: z.string().trim().min(1).max(64) });
const createSchema = z.object({
  url: webhookUrlSchema,
  events: webhookEventsSchema,
});
const updateSchema = idSchema.extend({
  url: webhookUrlSchema.optional(),
  events: webhookEventsSchema.optional(),
  active: z.boolean().optional(),
});

function failure(error: unknown, action: string): WebhookActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return { ok: false, error: "Sign in to manage webhooks." };
  }
  if (error instanceof HttpError) {
    return error.status === 402
      ? { ok: false, error: error.message, upgrade: true }
      : { ok: false, error: error.message };
  }
  logError(error as Error, { action });
  return { ok: false, error: "Something went wrong. Please try again." };
}

function invalid(error: z.ZodError): WebhookActionResult<never> {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
}

async function run<T>(
  action: string,
  limiter: typeof mutationLimiter,
  body: (scope: ActiveScope) => Promise<T>,
): Promise<WebhookActionResult<T>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter, key: `webhooks:${action}:${scope.userId}` },
    ]);
    const data = await body(scope);
    revalidatePath("/dashboard/webhooks", "layout");
    return { ok: true, data };
  } catch (error) {
    return failure(error, action);
  }
}

export async function createWebhookEndpoint(input: {
  url: string;
  events: string[];
}): Promise<
  WebhookActionResult<{ endpoint: WebhookEndpointView; secret: string }>
> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("create", mutationLimiter, (scope) =>
    createEndpoint(scope, parsed.data),
  );
}

export async function updateWebhookEndpoint(input: {
  id: string;
  url?: string;
  events?: string[];
  active?: boolean;
}): Promise<WebhookActionResult<WebhookEndpointView>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...patch } = parsed.data;
  return run("update", mutationLimiter, (scope) =>
    updateEndpoint(scope, id, patch),
  );
}

export async function deleteWebhookEndpoint(input: {
  id: string;
}): Promise<WebhookActionResult<{ id: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("delete", mutationLimiter, (scope) =>
    deleteEndpoint(scope, parsed.data.id),
  );
}

export async function revealWebhookSecret(input: {
  id: string;
}): Promise<WebhookActionResult<{ secret: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("reveal", mutationLimiter, async (scope) => ({
    secret: await revealSecret(scope, parsed.data.id),
  }));
}

export async function rotateWebhookSecret(input: {
  id: string;
}): Promise<WebhookActionResult<{ secret: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("rotate", mutationLimiter, async (scope) => ({
    secret: await rotateSecret(scope, parsed.data.id),
  }));
}

export async function sendWebhookTest(input: {
  id: string;
}): Promise<WebhookActionResult<SendResult>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("test", sendLimiter, (scope) =>
    sendTestPing(scope, parsed.data.id),
  );
}

export async function retryWebhookDelivery(input: {
  id: string;
}): Promise<WebhookActionResult<SendResult>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("retry", sendLimiter, (scope) =>
    retryDelivery(scope, parsed.data.id),
  );
}
