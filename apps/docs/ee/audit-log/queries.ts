import "server-only";

import {
  customDomain,
  database as db,
  landingPage,
  qrCode,
  webhookEndpoint,
  workspaceAuditLog,
} from "@repo/database";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import {
  type AuditCategory,
  actionsInCategory,
  auditCategoryOf,
  auditSentenceParts,
  type SentencePart,
} from "@/ee/audit-log/catalogue";
import type { AuditCsvRow } from "@/ee/audit-log/csv";
import { type AuditFilter, dayStart } from "@/ee/audit-log/filter";
import { AUDIT_EXPORT_MAX_ROWS, AUDIT_PAGE_SIZE } from "@/ee/audit-log/limits";
import { workspaceHref } from "@/lib/workspace-paths";

// Settings → Audit log: one workspace's rows, newest first, 50 at a time
// with a cursor, narrowed by who, category and dates. The CSV export reads
// the same filter in batches.

export type { AuditFilter } from "@/ee/audit-log/filter";

export {
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_PAGE_SIZE,
} from "@/ee/audit-log/limits";

const EXPORT_BATCH = 1_000;

interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.getTime()}:${row.id}`).toString(
    "base64url",
  );
}

export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value || value.length > 300) return null;
  const text = Buffer.from(value, "base64url").toString("utf8");
  const match = /^(\d{1,15}):([\w-]{1,128})$/.exec(text);
  if (!match) return null;
  return { createdAt: new Date(Number(match[1])), id: match[2] as string };
}

function filterWhere(
  organizationId: string,
  filter: AuditFilter,
  cursor: Cursor | null,
): SQL {
  const from = dayStart(filter.from);
  const toStart = dayStart(filter.to);
  const to = toStart ? new Date(toStart.getTime() + 86_400_000) : null;
  const parts = [
    eq(workspaceAuditLog.organizationId, organizationId),
    filter.actor ? eq(workspaceAuditLog.actorUserId, filter.actor) : null,
    filter.category
      ? inArray(workspaceAuditLog.action, actionsInCategory(filter.category))
      : null,
    from ? gte(workspaceAuditLog.createdAt, from) : null,
    to ? lt(workspaceAuditLog.createdAt, to) : null,
    cursor
      ? or(
          lt(workspaceAuditLog.createdAt, cursor.createdAt),
          and(
            eq(workspaceAuditLog.createdAt, cursor.createdAt),
            lt(workspaceAuditLog.id, cursor.id),
          ),
        )
      : null,
  ].filter((part): part is SQL => Boolean(part));
  return and(...parts) as SQL;
}

type AuditRow = typeof workspaceAuditLog.$inferSelect;

async function selectRows(
  organizationId: string,
  filter: AuditFilter,
  cursor: Cursor | null,
  limit: number,
): Promise<AuditRow[]> {
  return db
    .select()
    .from(workspaceAuditLog)
    .where(filterWhere(organizationId, filter, cursor))
    .orderBy(desc(workspaceAuditLog.createdAt), desc(workspaceAuditLog.id))
    .limit(limit);
}

export interface AuditEventView {
  id: string;
  /** ISO time */
  createdAt: string;
  action: string;
  category: AuditCategory | null;
  sentence: SentencePart[];
  actor: {
    type: string;
    /** As recorded: "Ana <ana@acme.com>", a key's or an app's name */
    label: string | null;
    /** For a key or an app: the person it acts for, as they are now */
    person: string | null;
  };
  target: {
    type: string | null;
    id: string | null;
    label: string | null;
    /** The target's page while it still exists */
    href: string | null;
  };
  metadata: Record<string, unknown> | null;
  ip: string | null;
  device: string | null;
}

export interface AuditPage {
  events: AuditEventView[];
  /** Pass back for the next 50; null at the end */
  nextCursor: string | null;
}

/** Ids among `ids` that still exist in the workspace, per target type. */
async function existingTargets(
  organizationId: string,
  rows: AuditRow[],
): Promise<Set<string>> {
  const idsOf = (type: string) => [
    ...new Set(
      rows
        .filter((row) => row.targetType === type && row.targetId)
        .map((row) => row.targetId as string),
    ),
  ];
  const codes = idsOf("code");
  const pages = idsOf("page");
  const hooks = idsOf("webhook");
  const domains = idsOf("domain");
  const [codeRows, pageRows, hookRows, domainRows] = await Promise.all([
    codes.length
      ? db
          .select({ id: qrCode.id })
          .from(qrCode)
          .where(
            and(
              inArray(qrCode.id, codes),
              eq(qrCode.organizationId, organizationId),
            ),
          )
      : [],
    pages.length
      ? db
          .select({ id: landingPage.id })
          .from(landingPage)
          .where(
            and(
              inArray(landingPage.id, pages),
              eq(landingPage.organizationId, organizationId),
            ),
          )
      : [],
    hooks.length
      ? db
          .select({ id: webhookEndpoint.id })
          .from(webhookEndpoint)
          .where(
            and(
              inArray(webhookEndpoint.id, hooks),
              eq(webhookEndpoint.organizationId, organizationId),
            ),
          )
      : [],
    domains.length
      ? db
          .select({ id: customDomain.id })
          .from(customDomain)
          .where(
            and(
              inArray(customDomain.id, domains),
              eq(customDomain.organizationId, organizationId),
            ),
          )
      : [],
  ]);
  return new Set([
    ...codeRows.map((row) => `code:${row.id}`),
    ...pageRows.map((row) => `page:${row.id}`),
    ...hookRows.map((row) => `webhook:${row.id}`),
    ...domainRows.map((row) => `domain:${row.id}`),
  ]);
}

function targetHref(
  slug: string,
  row: AuditRow,
  existing: Set<string>,
): string | null {
  const { targetType: type, targetId: id } = row;
  if (!(type && id && existing.has(`${type}:${id}`))) return null;
  const encoded = encodeURIComponent(id);
  switch (type) {
    case "code":
      return workspaceHref(slug, `/codes/${encoded}`);
    case "page":
      return workspaceHref(slug, `/pages/${encoded}`);
    case "webhook":
      return workspaceHref(slug, `/settings/webhooks/${encoded}`);
    case "domain":
      return workspaceHref(slug, "/settings/domains");
    default:
      return null;
  }
}

/** The snapshot of the person a key or an app acted for (record.ts). */
const actingFor = (row: AuditRow): string | null => {
  const value = (row.metadata as Record<string, unknown> | null)?.actingFor;
  return typeof value === "string" ? value : null;
};

function toView(
  row: AuditRow,
  slug: string,
  existing: Set<string>,
): AuditEventView {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    category: auditCategoryOf(row.action),
    sentence: auditSentenceParts(row.action, {
      type: row.targetType,
      label: row.targetLabel,
    }),
    actor: {
      type: row.actorType,
      label: row.actorLabel,
      person: row.actorType !== "user" ? actingFor(row) : null,
    },
    target: {
      type: row.targetType,
      id: row.targetId,
      label: row.targetLabel,
      href: targetHref(slug, row, existing),
    },
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ip: row.ip,
    device: row.device,
  };
}

/** One page of the workspace's events, newest first. */
export async function listAuditEvents(
  workspace: { organizationId: string; slug: string },
  filter: AuditFilter,
  cursor: string | null = null,
  limit = AUDIT_PAGE_SIZE,
): Promise<AuditPage> {
  const rows = await selectRows(
    workspace.organizationId,
    filter,
    decodeCursor(cursor),
    limit + 1,
  );
  const page = rows.slice(0, limit);
  const existing = await existingTargets(workspace.organizationId, page);
  const last = page.at(-1);
  return {
    events: page.map((row) => toView(row, workspace.slug, existing)),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}

/**
 * The CSV export's rows, newest first, in batches, up to `max` in all.
 * Each batch is one indexed query, so the response streams as it reads.
 */
export async function* auditExportRows(
  organizationId: string,
  filter: AuditFilter,
  max = AUDIT_EXPORT_MAX_ROWS,
): AsyncGenerator<AuditCsvRow[]> {
  let cursor: Cursor | null = null;
  let sent = 0;
  while (sent < max) {
    const rows = await selectRows(
      organizationId,
      filter,
      cursor,
      Math.min(EXPORT_BATCH, max - sent),
    );
    if (rows.length === 0) return;
    sent += rows.length;
    yield rows.map((row) => ({
      ...row,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    }));
    const last = rows.at(-1) as AuditRow;
    cursor = { createdAt: last.createdAt, id: last.id };
    if (rows.length < EXPORT_BATCH) return;
  }
}

export interface AuditActorOption {
  id: string;
  label: string;
}

/**
 * The people in the filter's "Who" list: everyone who has done something
 * in the log (members who left included), named as the log recorded them
 * (their latest row), never as their account reads now.
 */
export async function listAuditActors(
  organizationId: string,
): Promise<AuditActorOption[]> {
  const inWorkspace = eq(workspaceAuditLog.organizationId, organizationId);
  const latest = (people: boolean) =>
    db
      .selectDistinctOn([workspaceAuditLog.actorUserId], {
        id: workspaceAuditLog.actorUserId,
        label: workspaceAuditLog.actorLabel,
        metadata: workspaceAuditLog.metadata,
      })
      .from(workspaceAuditLog)
      .where(
        and(
          inWorkspace,
          isNotNull(workspaceAuditLog.actorUserId),
          people
            ? eq(workspaceAuditLog.actorType, "user")
            : inArray(workspaceAuditLog.actorType, [
                "api_key",
                "oauth_app",
                "slack",
              ]),
        ),
      )
      .orderBy(workspaceAuditLog.actorUserId, desc(workspaceAuditLog.createdAt))
      .limit(500);
  const [asPeople, throughKeys] = await Promise.all([
    latest(true),
    latest(false),
  ]);
  const labels = new Map<string, string>();
  for (const row of asPeople) {
    if (row.id && row.label) labels.set(row.id, row.label);
  }
  for (const row of throughKeys) {
    if (!row.id || labels.has(row.id)) continue;
    const person = (row.metadata as Record<string, unknown> | null)?.actingFor;
    labels.set(
      row.id,
      typeof person === "string"
        ? person
        : `Someone using ${row.label ? `“${row.label}”` : "an API key or app"}`,
    );
  }
  return [...labels]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
