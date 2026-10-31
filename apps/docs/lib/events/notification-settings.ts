import "server-only";

import {
  database as db,
  member,
  notificationSetting,
  organization,
  user,
} from "@repo/database";
import cuid from "cuid";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { postChatMessage } from "./notify";
import { invalidateSubscribers } from "./subscribers";
import {
  CHAT_NOTIFICATION_EVENTS,
  MAX_CHAT_TARGETS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from "./types";
import type { UnsubscribeScope } from "./unsubscribe";
import {
  checkDiscordWebhookUrl,
  checkSlackWebhookUrl,
  maskChatWebhookUrl,
} from "./url-safety";

// notification_setting rows belong to one person and one workspace
// (organization_id null = personal). Each person has at most one email row
// per workspace (always their own account address) plus Slack / Discord
// incoming-webhook targets.

export type ChatChannel = "slack" | "discord";

export const notificationEventsSchema = z
  .array(z.enum(NOTIFICATION_EVENTS))
  .max(NOTIFICATION_EVENTS.length)
  .transform((events) => [...new Set(events)]);

export const chatEventsSchema = z
  .array(z.enum(NOTIFICATION_EVENTS))
  .min(1, "Pick at least one event")
  .max(NOTIFICATION_EVENTS.length)
  .transform((events) => [
    ...new Set(
      events.filter((event) => CHAT_NOTIFICATION_EVENTS.includes(event)),
    ),
  ])
  .refine((events) => events.length > 0, "Pick at least one event");

export interface NotificationWorkspace {
  organizationId: string | null;
  name: string;
  plan: Plan;
  emailAlerts: boolean;
  chat: boolean;
  email: { id: string; events: NotificationEvent[] } | null;
  chats: {
    id: string;
    channel: ChatChannel;
    label: string;
    events: NotificationEvent[];
    createdAt: Date;
  }[];
}

const asEvents = (value: unknown): NotificationEvent[] =>
  Array.isArray(value)
    ? value.filter((event): event is NotificationEvent =>
        (NOTIFICATION_EVENTS as readonly string[]).includes(event),
      )
    : [];

function workspaceWhere(userId: string, organizationId: string | null): SQL {
  return and(
    eq(notificationSetting.userId, userId),
    organizationId
      ? eq(notificationSetting.organizationId, organizationId)
      : isNull(notificationSetting.organizationId),
  ) as SQL;
}

const scopeOf = (userId: string, organizationId: string | null) => ({
  userId,
  organizationId,
});

async function assertMember(userId: string, organizationId: string | null) {
  if (!organizationId) return;
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(403, "FORBIDDEN", "You're not a member of that team.");
  }
}

async function planFor(userId: string, organizationId: string | null) {
  const limits = getPlanLimits(
    await getPlanForScope(scopeOf(userId, organizationId)),
  );
  return { emailAlerts: limits.emailAlerts, chat: limits.webhooks };
}

/** Personal workspace first, then every team the person belongs to. */
export async function listNotificationWorkspaces(
  userId: string,
): Promise<NotificationWorkspace[]> {
  const [teams, settings] = await db.batch([
    db
      .select({ id: organization.id, name: organization.name })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(asc(organization.name)),
    db
      .select()
      .from(notificationSetting)
      .where(eq(notificationSetting.userId, userId))
      .orderBy(asc(notificationSetting.createdAt)),
  ]);

  const scopes: { organizationId: string | null; name: string }[] = [
    { organizationId: null, name: "Personal workspace" },
    ...teams.map((team) => ({ organizationId: team.id, name: team.name })),
  ];

  return Promise.all(
    scopes.map(async ({ organizationId, name }) => {
      const plan = await getPlanForScope(scopeOf(userId, organizationId));
      const limits = getPlanLimits(plan);
      const rows = settings.filter(
        (row) => row.organizationId === organizationId,
      );
      const emailRow = rows.find((row) => row.channel === "email");
      return {
        organizationId,
        name,
        plan,
        emailAlerts: limits.emailAlerts,
        chat: limits.webhooks,
        email: emailRow
          ? { id: emailRow.id, events: asEvents(emailRow.events) }
          : null,
        chats: rows
          .filter((row) => row.channel !== "email")
          .map((row) => ({
            id: row.id,
            channel: row.channel as ChatChannel,
            label: maskChatWebhookUrl(row.target),
            events: asEvents(row.events),
            createdAt: row.createdAt,
          })),
      };
    }),
  );
}

/** Replaces the person's email events for a workspace ([] turns email off). */
export async function setEmailEvents(
  userId: string,
  organizationId: string | null,
  events: NotificationEvent[],
): Promise<void> {
  await assertMember(userId, organizationId);
  const where = and(
    workspaceWhere(userId, organizationId),
    eq(notificationSetting.channel, "email"),
  );
  if (events.length === 0) {
    await db.delete(notificationSetting).where(where);
    invalidateSubscribers(scopeOf(userId, organizationId));
    return;
  }
  if (!(await planFor(userId, organizationId)).emailAlerts) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Email alerts and the weekly digest are part of Pro.",
    );
  }
  const [account] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) throw new HttpError(404, "NOT_FOUND", "Account not found.");

  const existing = await db
    .select({ id: notificationSetting.id })
    .from(notificationSetting)
    .where(where);
  const [first, ...duplicates] = existing;
  if (first) {
    await db
      .update(notificationSetting)
      .set({ events, target: account.email })
      .where(eq(notificationSetting.id, first.id));
    for (const duplicate of duplicates) {
      await db
        .delete(notificationSetting)
        .where(eq(notificationSetting.id, duplicate.id));
    }
  } else {
    await db.insert(notificationSetting).values({
      id: cuid(),
      userId,
      organizationId,
      channel: "email",
      target: account.email,
      events,
    });
  }
  invalidateSubscribers(scopeOf(userId, organizationId));
}

export function checkChatUrl(channel: ChatChannel, url: string): string {
  const checked =
    channel === "slack"
      ? checkSlackWebhookUrl(url)
      : checkDiscordWebhookUrl(url);
  if (!checked.ok) {
    throw new HttpError(400, "VALIDATION_ERROR", checked.message);
  }
  return checked.url.toString();
}

export async function addChatTarget(
  userId: string,
  organizationId: string | null,
  input: { channel: ChatChannel; url: string; events: NotificationEvent[] },
): Promise<{ id: string }> {
  await assertMember(userId, organizationId);
  if (!(await planFor(userId, organizationId)).chat) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Slack and Discord alerts are part of the Business plan.",
    );
  }
  const url = checkChatUrl(input.channel, input.url);
  const rows = await db
    .select({
      id: notificationSetting.id,
      target: notificationSetting.target,
      channel: notificationSetting.channel,
    })
    .from(notificationSetting)
    .where(workspaceWhere(userId, organizationId));
  const chats = rows.filter((row) => row.channel !== "email");
  if (chats.some((row) => row.target === url)) {
    throw new HttpError(
      409,
      "ALREADY_EXISTS",
      "That webhook is already added.",
    );
  }
  if (chats.length >= MAX_CHAT_TARGETS) {
    throw new HttpError(
      403,
      "LIMIT_REACHED",
      `Add up to ${MAX_CHAT_TARGETS} Slack or Discord webhooks per workspace.`,
    );
  }
  const id = cuid();
  await db.insert(notificationSetting).values({
    id,
    userId,
    organizationId,
    channel: input.channel,
    target: url,
    events: input.events,
  });
  invalidateSubscribers(scopeOf(userId, organizationId));
  return { id };
}

async function findOwnChatTarget(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(notificationSetting)
    .where(
      and(
        eq(notificationSetting.id, id),
        eq(notificationSetting.userId, userId),
      ),
    )
    .limit(1);
  if (!row || row.channel === "email") {
    throw new HttpError(404, "NOT_FOUND", "Notification target not found.");
  }
  return row;
}

export async function updateChatTarget(
  userId: string,
  id: string,
  events: NotificationEvent[],
): Promise<void> {
  const row = await findOwnChatTarget(userId, id);
  if (!(await planFor(userId, row.organizationId)).chat) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Slack and Discord alerts are part of the Business plan.",
    );
  }
  await db
    .update(notificationSetting)
    .set({ events })
    .where(eq(notificationSetting.id, id));
  invalidateSubscribers(scopeOf(userId, row.organizationId));
}

/** Removing is allowed on every plan. */
export async function removeChatTarget(userId: string, id: string) {
  const row = await findOwnChatTarget(userId, id);
  await db.delete(notificationSetting).where(eq(notificationSetting.id, id));
  invalidateSubscribers(scopeOf(userId, row.organizationId));
}

export async function sendTestChatMessage(userId: string, id: string) {
  const row = await findOwnChatTarget(userId, id);
  if (!(await planFor(userId, row.organizationId)).chat) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Slack and Discord alerts are part of the Business plan.",
    );
  }
  const result = await postChatMessage(row.channel as ChatChannel, row.target, {
    text: "Test notification from QRdx. Alerts you picked will show up here.",
    url: new URL("/settings/notifications", baseUrl.origin).toString(),
  });
  if (!result.ok) {
    throw new HttpError(
      502,
      "DELIVERY_FAILED",
      `Not delivered: ${result.error}`,
    );
  }
}

/**
 * Unsubscribe link handler: removes the event (or every event) from an email
 * setting; deletes the row when nothing is left. Idempotent.
 */
export async function applyUnsubscribe(
  settingId: string,
  event: UnsubscribeScope,
): Promise<{ found: boolean }> {
  const [row] = await db
    .select()
    .from(notificationSetting)
    .where(eq(notificationSetting.id, settingId))
    .limit(1);
  if (!row || row.channel !== "email") return { found: false };
  const remaining =
    event === "all"
      ? []
      : asEvents(row.events).filter((item) => item !== event);
  if (remaining.length === 0) {
    await db
      .delete(notificationSetting)
      .where(eq(notificationSetting.id, row.id));
  } else {
    await db
      .update(notificationSetting)
      .set({ events: remaining })
      .where(eq(notificationSetting.id, row.id));
  }
  invalidateSubscribers(scopeOf(row.userId, row.organizationId));
  return { found: true };
}
