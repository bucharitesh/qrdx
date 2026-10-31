"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import {
  addChatTarget,
  chatEventsSchema,
  notificationEventsSchema,
  removeChatTarget,
  sendTestChatMessage,
  setEmailEvents,
  updateChatTarget,
} from "@/lib/events/notification-settings";
import { enforceRateLimits } from "@/lib/request-guards";
import { getCurrentUserId, logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type NotificationActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; upgrade?: "pro" | "business" };

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});
const testLimiter = createRateLimiter({ limiter: slidingWindow(5, "60 s") });

const workspaceSchema = z.string().trim().min(1).max(128).nullable();
const idSchema = z.string().trim().min(1).max(64);

const emailSchema = z.object({
  organizationId: workspaceSchema,
  events: notificationEventsSchema,
});
const addSchema = z.object({
  organizationId: workspaceSchema,
  channel: z.enum(["slack", "discord"]),
  url: z.string().trim().min(1, "Paste the webhook URL").max(2048),
  events: chatEventsSchema,
});
const updateSchema = z.object({ id: idSchema, events: chatEventsSchema });
const targetSchema = z.object({ id: idSchema });

function failure(
  error: unknown,
  action: string,
): NotificationActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return { ok: false, error: "Sign in to change notifications." };
  }
  if (error instanceof HttpError) {
    if (error.status === 402) {
      return {
        ok: false,
        error: error.message,
        upgrade: /Business/.test(error.message) ? "business" : "pro",
      };
    }
    return { ok: false, error: error.message };
  }
  logError(error as Error, { action });
  return { ok: false, error: "Something went wrong. Please try again." };
}

async function run<T>(
  action: string,
  limiter: typeof mutationLimiter,
  body: (userId: string) => Promise<T>,
): Promise<NotificationActionResult<T>> {
  try {
    const userId = await getCurrentUserId();
    await enforceRateLimits([
      { limiter, key: `notifications:${action}:${userId}` },
    ]);
    const data = await body(userId);
    revalidatePath("/settings/notifications");
    return { ok: true, data };
  } catch (error) {
    return failure(error, action);
  }
}

const invalid = (error: z.ZodError): NotificationActionResult<never> => ({
  ok: false,
  error: error.issues[0]?.message ?? "Invalid input.",
});

export async function setNotificationEmailEvents(input: {
  organizationId: string | null;
  events: string[];
}): Promise<NotificationActionResult> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("email", mutationLimiter, async (userId) => {
    await setEmailEvents(
      userId,
      parsed.data.organizationId,
      parsed.data.events,
    );
    return null;
  });
}

export async function addNotificationWebhook(input: {
  organizationId: string | null;
  channel: "slack" | "discord";
  url: string;
  events: string[];
}): Promise<NotificationActionResult<{ id: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { organizationId, ...target } = parsed.data;
  return run("add", mutationLimiter, (userId) =>
    addChatTarget(userId, organizationId, target),
  );
}

export async function updateNotificationWebhook(input: {
  id: string;
  events: string[];
}): Promise<NotificationActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("update", mutationLimiter, async (userId) => {
    await updateChatTarget(userId, parsed.data.id, parsed.data.events);
    return null;
  });
}

export async function removeNotificationWebhook(input: {
  id: string;
}): Promise<NotificationActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("remove", mutationLimiter, async (userId) => {
    await removeChatTarget(userId, parsed.data.id);
    return null;
  });
}

export async function testNotificationWebhook(input: {
  id: string;
}): Promise<NotificationActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run("test", testLimiter, async (userId) => {
    await sendTestChatMessage(userId, parsed.data.id);
    return null;
  });
}
