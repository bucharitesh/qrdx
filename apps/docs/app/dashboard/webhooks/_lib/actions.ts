"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import { HttpError } from "@/lib/error-response";
import {
  canManageWebhooks,
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
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
  {
    confirm = false,
  }: {
    /** Asks "Confirm it's you" first; a function decides per request. */
    confirm?: boolean | ((scope: ActiveScope) => Promise<boolean>);
  } = {},
): Promise<WebhookActionResult<T>> {
  try {
    const scope = await getActiveScope();
    // Before the limits, so the round trip that asks doesn't use one up.
    // Someone who can't manage webhooks gets that refusal instead.
    if (
      canManageWebhooks(scope) &&
      (typeof confirm === "function" ? await confirm(scope) : confirm)
    ) {
      const needed = await confirmationNeededFor(scope);
      if (needed) return needed;
    }
    await enforceRateLimits([
      { limiter, key: `webhooks:${action}:${scope.userId}` },
    ]);
    const data = await body(scope);
    revalidatePath("/dashboard", "layout");
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
  // A new endpoint receives the workspace's events: "Confirm it's you".
  return run(
    "create",
    mutationLimiter,
    (scope) => createEndpoint(scope, parsed.data),
    { confirm: true },
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
  // Sending the events to a new address asks "Confirm it's you"; changing
  // which events, or pausing, doesn't.
  return run(
    "update",
    mutationLimiter,
    (scope) => updateEndpoint(scope, id, patch),
    {
      confirm: async (scope) =>
        patch.url !== undefined &&
        (await getEndpoint(scope, id)).url !== patch.url,
    },
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

/**
 * Shows an endpoint's signing secret. Whoever has it can sign requests your
 * server trusts as QRdx's, so it asks "Confirm it's you" first
 * (CONFIRMATION_REQUIRED when this session hasn't in the last 10 minutes).
 */
export async function revealWebhookSecret(input: {
  id: string;
}): Promise<WebhookActionResult<{ secret: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(
    "reveal",
    mutationLimiter,
    async (scope) => ({ secret: await revealSecret(scope, parsed.data.id) }),
    { confirm: true },
  );
}

/** A new signing secret, shown once: asks "Confirm it's you" like reveal. */
export async function rotateWebhookSecret(input: {
  id: string;
}): Promise<WebhookActionResult<{ secret: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(
    "rotate",
    mutationLimiter,
    async (scope) => ({ secret: await rotateSecret(scope, parsed.data.id) }),
    { confirm: true },
  );
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
