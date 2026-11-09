import "server-only";

import { workspaceRequiresTwoFactor } from "@repo/auth/workspace-two-factor";
import {
  database as db,
  member,
  type NotificationChannel,
  notificationSetting,
  user,
  webhookEndpoint,
} from "@repo/database";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { getPlanForScope, type Plan } from "@/lib/plans";

/** A workspace (organizationId null only for rows from before workspaces). */
export interface EventScope {
  userId: string;
  organizationId: string | null;
}

export interface SubscribedEndpoint {
  id: string;
  events: string[];
}

export interface NotificationTarget {
  id: string;
  /** The person who set the target up */
  userId: string;
  userName: string;
  channel: NotificationChannel;
  /** Email: the person's current account address. Chat: the webhook URL. */
  target: string;
  events: string[];
}

export interface Subscribers {
  plan: Plan;
  endpoints: SubscribedEndpoint[];
  targets: NotificationTarget[];
}

export const scopeKey = (scope: EventScope) =>
  scope.organizationId ? `org:${scope.organizationId}` : `user:${scope.userId}`;

export function endpointScopeWhere(scope: EventScope): SQL {
  return scope.organizationId
    ? eq(webhookEndpoint.organizationId, scope.organizationId)
    : (and(
        eq(webhookEndpoint.userId, scope.userId),
        isNull(webhookEndpoint.organizationId),
      ) as SQL);
}

function settingScopeWhere(scope: EventScope): SQL {
  return scope.organizationId
    ? eq(notificationSetting.organizationId, scope.organizationId)
    : (and(
        eq(notificationSetting.userId, scope.userId),
        isNull(notificationSetting.organizationId),
      ) as SQL);
}

const asEvents = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/**
 * Drops the rows of people a workspace shuts out for lacking two-step
 * verification (lib/workspaces.ts): they can't see anything in it until they
 * turn it on, its form responses in an email, a chat channel or a digest
 * included. One read of each workspace's setting, and only for rows whose
 * person has it off.
 */
export async function withoutShutOutMembers<
  T extends { organizationId: string | null; twoFactorOn: boolean | null },
>(rows: T[]): Promise<T[]> {
  const requires = new Map<string, Promise<boolean>>();
  const kept: T[] = [];
  for (const row of rows) {
    if (row.organizationId && row.twoFactorOn !== true) {
      let required = requires.get(row.organizationId);
      if (!required) {
        required = workspaceRequiresTwoFactor(row.organizationId);
        requires.set(row.organizationId, required);
      }
      if (await required) continue;
    }
    kept.push(row);
  }
  return kept;
}

async function querySubscribers(
  scope: EventScope,
): Promise<Subscribers | null> {
  const [endpoints, settings] = await db.batch([
    db
      .select({ id: webhookEndpoint.id, events: webhookEndpoint.events })
      .from(webhookEndpoint)
      .where(and(endpointScopeWhere(scope), eq(webhookEndpoint.active, true))),
    db
      .select({
        id: notificationSetting.id,
        userId: notificationSetting.userId,
        channel: notificationSetting.channel,
        target: notificationSetting.target,
        events: notificationSetting.events,
        organizationId: notificationSetting.organizationId,
        email: user.email,
        userName: user.name,
        twoFactorOn: user.twoFactorEnabled,
        memberId: member.id,
      })
      .from(notificationSetting)
      .innerJoin(user, eq(user.id, notificationSetting.userId))
      .leftJoin(
        member,
        and(
          eq(member.userId, notificationSetting.userId),
          eq(member.organizationId, notificationSetting.organizationId),
        ),
      )
      .where(settingScopeWhere(scope)),
  ]);

  // People who left a team stop getting its notifications, and so do
  // members it shuts out until they turn on two-step verification.
  const members = await withoutShutOutMembers(
    settings.filter((row) => !scope.organizationId || row.memberId),
  );

  const targets: NotificationTarget[] = members
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.userName,
      channel: row.channel,
      target: row.channel === "email" ? row.email : row.target,
      events: asEvents(row.events),
    }))
    .filter((row) => row.events.length > 0);

  const subscribed = endpoints
    .map((row) => ({ id: row.id, events: asEvents(row.events) }))
    .filter((row) => row.events.length > 0);

  if (subscribed.length === 0 && targets.length === 0) return null;
  return {
    plan: await getPlanForScope(scope),
    endpoints: subscribed,
    targets,
  };
}

// Scans are the hot path: remember each workspace's subscribers briefly so a
// busy code doesn't look them up on every scan. Changes made on another
// server instance apply within this window.
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 2000;
const cache = new Map<string, { at: number; value: Subscribers | null }>();

export async function loadSubscribers(
  scope: EventScope,
  { cached = false }: { cached?: boolean } = {},
): Promise<Subscribers | null> {
  const key = scopeKey(scope);
  const now = Date.now();
  if (cached) {
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;
  }
  const value = await querySubscribers(scope);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(key, { at: now, value });
  return value;
}

/** Call after changing a workspace's endpoints or notification targets. */
export function invalidateSubscribers(scope: EventScope) {
  cache.delete(scopeKey(scope));
}
