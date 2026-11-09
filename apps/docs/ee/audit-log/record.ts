import "server-only";

import {
  apiKey,
  database as db,
  oauthApp,
  oauthToken,
  user,
  workspaceAuditLog,
} from "@repo/database";
import cuid from "cuid";
import { eq } from "drizzle-orm";
import { headers as requestHeaders } from "next/headers";
import { after } from "next/server";
import { isAuditLogEntitled } from "@/ee/audit-log/access";
import type {
  AuditAction,
  AuditActorType,
  AuditTargetType,
} from "@/ee/audit-log/catalogue";
import { sanitizeAuditMetadata } from "@/ee/audit-log/metadata";
import { isMissingTableError } from "@/ee/audit-log/missing-table";
import { hashApiKey } from "@/lib/api-keys/crypto";
import { isApiKeyFormat } from "@/lib/api-keys/shared";
import { logError } from "@/lib/log-error";
import { hashToken } from "@/lib/oauth";
import type { Plan } from "@/lib/plans";
import { requestDetails } from "@/lib/security/request-details";

// Records workspace audit log events (Settings → Audit log). Call it after a
// change has gone through, from the action or service function that made
// it; nothing hooks the database layer.
//
//   recordAuditEvent(scope, {
//     action: "code.destination_changed",
//     target: { type: "code", id: code.id, label: code.title },
//     metadata: { before: { destinationUrl: old }, after: { destinationUrl: url } },
//   });
//
// Best effort: it returns at once and writes after the response (next/server
// `after`). Who did it comes from the request: an API key or OAuth token in
// the Authorization header, else the signed-in person. Nothing is stored
// unless the workspace is entitled (ee/audit-log/access.ts). A failed write,
// including the table not existing yet, is logged and never reaches the
// person's action.

/** The workspace and the person acting in it (an ActiveScope fits). */
export interface AuditContext {
  organizationId: string;
  /** The signed-in person, or the API key's creator; null for system events */
  userId: string | null;
}

export interface AuditTarget {
  type: AuditTargetType;
  id?: string | null;
  /**
   * The name to show (a code's name, a domain). For a "member" target with
   * an id (a user id) and no label, the person's name and email are looked up.
   */
  label?: string | null;
}

export interface AuditEventInput {
  action: AuditAction;
  target?: AuditTarget | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditOptions {
  /** A system event (no person): the billing webhook. */
  system?: { label: string };
  /** The workspace's plan when the caller already knows it. */
  plan?: Plan;
}

interface Actor {
  actorType: AuditActorType;
  actorUserId: string | null;
  actorLabel: string | null;
  apiKeyId: string | null;
  oauthAppId: string | null;
}

type HeaderSource = Pick<Headers, "get">;

const MAX_LABEL = 300;

const clip = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  if (!text) return null;
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
};

/** "Ana Diaz <ana@acme.com>", or the email alone. */
export function personLabel(
  name: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const cleanName = name?.replace(/[<>]/g, "").trim();
  const cleanEmail = email?.trim();
  if (cleanName && cleanEmail && cleanName !== cleanEmail) {
    return `${cleanName} <${cleanEmail}>`;
  }
  return cleanEmail || cleanName || null;
}

/** A person's current name and email, as a row records them. */
export async function userLabel(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ? personLabel(row.name, row.email) : null;
}

function bearerToken(source: HeaderSource | null): string | null {
  const value = source?.get("authorization")?.trim() ?? "";
  if (!/^Bearer\s+/i.test(value)) return null;
  return value.replace(/^Bearer\s+/i, "").trim() || null;
}

/**
 * The API key or OAuth app behind the request's Bearer credential. The API
 * route has already checked it; this only names it. Null for a session.
 */
async function credentialActor(
  token: string,
  fallbackUserId: string | null,
): Promise<Actor | null> {
  if (isApiKeyFormat(token)) {
    const [key] = await db
      .select({ id: apiKey.id, name: apiKey.name, userId: apiKey.userId })
      .from(apiKey)
      .where(eq(apiKey.keyHash, hashApiKey(token)))
      .limit(1);
    if (!key) return null;
    return {
      actorType: "api_key",
      actorUserId: key.userId ?? fallbackUserId,
      actorLabel: clip(key.name),
      apiKeyId: key.id,
      oauthAppId: null,
    };
  }
  const [grant] = await db
    .select({ appId: oauthToken.appId, name: oauthApp.name })
    .from(oauthToken)
    .innerJoin(oauthApp, eq(oauthApp.id, oauthToken.appId))
    .where(eq(oauthToken.accessTokenHash, hashToken(token)))
    .limit(1);
  if (!grant) return null;
  return {
    actorType: "oauth_app",
    actorUserId: fallbackUserId,
    actorLabel: clip(grant.name),
    apiKeyId: null,
    oauthAppId: grant.appId,
  };
}

async function resolveActor(
  ctx: AuditContext,
  source: HeaderSource | null,
  options: AuditOptions,
): Promise<Actor> {
  if (options.system || !ctx.userId) {
    return {
      actorType: "system",
      actorUserId: null,
      actorLabel: clip(options.system?.label ?? "QRdx"),
      apiKeyId: null,
      oauthAppId: null,
    };
  }
  const token = bearerToken(source);
  if (token) {
    const credential = await credentialActor(token, ctx.userId);
    if (credential) return credential;
  }
  return {
    actorType: "user",
    actorUserId: ctx.userId,
    actorLabel: clip(await userLabel(ctx.userId)),
    apiKeyId: null,
    oauthAppId: null,
  };
}

let missingTableLogged = false;

/**
 * Events, or a function that builds them (it runs after the response, and
 * only for an entitled workspace, so lookups for names and old values never
 * slow the person's request).
 */
export type AuditEvents =
  | AuditEventInput
  | AuditEventInput[]
  | (() => AuditEventInput[] | Promise<AuditEventInput[]>);

const eventList = async (events: AuditEvents): Promise<AuditEventInput[]> => {
  if (typeof events === "function") return await events();
  return Array.isArray(events) ? events : [events];
};

/**
 * Writes the events now and returns how many rows were stored (0 when the
 * workspace isn't entitled or the write failed). Never throws. Tests call it
 * directly; the app calls recordAuditEvent.
 */
export async function writeAuditEvents(
  ctx: AuditContext,
  events: AuditEvents,
  options: AuditOptions & {
    headers?: HeaderSource | null;
    now?: Date;
  } = {},
): Promise<number> {
  if (!ctx.organizationId) return 0;
  if (Array.isArray(events) && events.length === 0) return 0;
  let actions: string[] = [];
  try {
    if (!(await isAuditLogEntitled(ctx.organizationId, options.plan))) {
      return 0;
    }
    const list = await eventList(events);
    actions = list.map((event) => event.action);
    if (list.length === 0) return 0;
    const source = options.headers ?? null;
    const actor = await resolveActor(ctx, source, options);
    const details =
      actor.actorType === "system" || !source ? null : requestDetails(source);
    const memberLabels = new Map<string, string | null>();
    for (const event of list) {
      const target = event.target;
      if (target?.type === "member" && target.id && !target.label) {
        if (!memberLabels.has(target.id)) {
          memberLabels.set(target.id, await userLabel(target.id));
        }
      }
    }
    const now = options.now ?? new Date();
    const rows = list.map((event) => {
      const target = event.target ?? null;
      const label =
        target?.label ??
        (target?.type === "member" && target.id
          ? memberLabels.get(target.id)
          : null);
      return {
        id: cuid(),
        organizationId: ctx.organizationId,
        ...actor,
        action: event.action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        targetLabel: clip(label),
        metadata: sanitizeAuditMetadata(event.metadata),
        ip: details?.ip ?? null,
        device:
          details && details.device !== "Unknown device"
            ? clip(details.device)
            : null,
        createdAt: now,
      };
    });
    await db.insert(workspaceAuditLog).values(rows);
    return rows.length;
  } catch (error) {
    if (isMissingTableError(error)) {
      if (!missingTableLogged) {
        missingTableLogged = true;
        console.warn(
          "Workspace audit log: the workspace_audit_log table doesn't exist yet (packages/database/manual-sql/2026-11-09-workspace-audit-log.sql). Nothing is recorded until it does.",
        );
      }
      return 0;
    }
    logError(error as Error, {
      action: "audit-log.record",
      events: actions,
      organizationId: ctx.organizationId,
    });
    return 0;
  }
}

async function currentHeaders(): Promise<HeaderSource | null> {
  try {
    return await requestHeaders();
  } catch {
    // Outside a request (a script, a test): no IP, device or credential.
    return null;
  }
}

/**
 * Records one or more events for the workspace in `ctx`, after the response.
 * Returns at once and never throws.
 */
export function recordAuditEvent(
  ctx: AuditContext,
  events: AuditEvents,
  options: AuditOptions = {},
): void {
  if (Array.isArray(events) && events.length === 0) return;
  // Copied now: the caller may change its objects after this returns.
  const context = { organizationId: ctx.organizationId, userId: ctx.userId };
  const task = async () => {
    await writeAuditEvents(context, events, {
      ...options,
      headers: await currentHeaders(),
    });
  };
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): write now.
    void task();
  }
}
