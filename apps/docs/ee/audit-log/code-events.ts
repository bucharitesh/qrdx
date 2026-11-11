import "server-only";

import { database as db, organization, qrCode } from "@repo/database";
import { eq, inArray } from "drizzle-orm";
import { getDomainRefs } from "@/app/(app)/dashboard/domains/_lib/domains";
import type { AuditAction } from "@/ee/audit-log/catalogue";
import { changedFields, hasChanges } from "@/ee/audit-log/metadata";
import {
  type AuditEventInput,
  type AuditTarget,
  recordAuditEvent,
} from "@/ee/audit-log/record";
import { codeLinks } from "@/lib/short-links";

// Audit log events for codes, built from what the code services already
// have, so each call site is one line. Labels are the code's name, or its
// short link when it has none.

interface CodeRef {
  id: string;
  title: string | null;
  slug: string;
  shortLink?: string;
}

const bare = (link: string) => link.replace(/^https?:\/\//, "");

export function codeTarget(code: CodeRef): AuditTarget {
  return {
    type: "code",
    id: code.id,
    label:
      code.title?.trim() || (code.shortLink ? bare(code.shortLink) : code.slug),
  };
}

/** The same event for each code: bulk archive, trash, restore, delete. */
export function codeEvents(
  action: AuditAction,
  codes: CodeRef[],
  metadata?: Record<string, unknown>,
): AuditEventInput[] {
  return codes.map((code) => ({
    action,
    target: codeTarget(code),
    ...(metadata && { metadata }),
  }));
}

/**
 * codeEvents for codes known by id only (unarchive and restore check plan
 * slots and return ids): names are read when the events are built.
 */
export async function codeEventsByIds(
  action: AuditAction,
  ids: string[],
  metadata?: Record<string, unknown>,
): Promise<AuditEventInput[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: qrCode.id, title: qrCode.title, slug: qrCode.slug })
    .from(qrCode)
    .where(inArray(qrCode.id, ids));
  return codeEvents(action, rows, metadata);
}

const when = (value: Date | null | undefined) =>
  value ? value.toISOString() : null;

/**
 * Link controls (actions/code-lifecycle.ts): what changed, with the
 * password only as on, off or changed.
 */
export function linkControlChanges(
  previous: {
    passwordHash: string | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    scanLimit: number | null;
    fallbackUrl: string | null;
  },
  values: Record<string, unknown>,
) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  if (values.passwordHash !== undefined) {
    before.passwordSet = previous.passwordHash ? "On" : "Off";
    after.passwordSet = values.passwordHash
      ? previous.passwordHash
        ? "Changed"
        : "On"
      : "Off";
  }
  if (values.startsAt !== undefined) {
    before.startsAt = when(previous.startsAt);
    after.startsAt = when(values.startsAt as Date | null);
  }
  if (values.expiresAt !== undefined) {
    before.expiresAt = when(previous.expiresAt);
    after.expiresAt = when(values.expiresAt as Date | null);
  }
  if (values.scanLimit !== undefined) {
    before.scanLimit = previous.scanLimit;
    after.scanLimit = values.scanLimit;
  }
  if (values.fallbackUrl !== undefined) {
    before.fallbackUrl = previous.fallbackUrl;
    after.fallbackUrl = values.fallbackUrl;
  }
  return { before, after };
}

interface CodeRow {
  id: string;
  slug: string;
  slugScope: string;
  title: string | null;
  destinationUrl: string;
  domainId: string | null;
}

interface CodeView extends CodeRef {
  destinationUrl: string;
}

/**
 * The events for one edit (updateCode): destination, name, design and short
 * link each get their own row, with the old and new value.
 */
export async function codeUpdateEvents(
  previous: CodeRow,
  code: CodeView,
  values: Record<string, unknown>,
): Promise<AuditEventInput[]> {
  const target = codeTarget(code);
  const events: AuditEventInput[] = [];
  if ("destinationUrl" in values) {
    const change = changedFields(
      { destinationUrl: previous.destinationUrl },
      { destinationUrl: code.destinationUrl },
    );
    if (hasChanges(change)) {
      events.push({
        action: "code.destination_changed",
        target,
        metadata: change,
      });
    }
  }
  if ("title" in values) {
    const change = changedFields(
      { title: previous.title },
      { title: code.title },
    );
    if (hasChanges(change)) {
      events.push({ action: "code.renamed", target, metadata: change });
    }
  }
  if ("style" in values) events.push({ action: "code.style_changed", target });
  if (("slug" in values || "domainId" in values) && code.shortLink) {
    const domains = previous.domainId
      ? await getDomainRefs([previous.domainId])
      : new Map();
    const before = codeLinks(
      previous,
      previous.domainId ? (domains.get(previous.domainId) ?? null) : null,
    ).link;
    const change = changedFields(
      { shortLink: bare(before) },
      { shortLink: bare(code.shortLink) },
    );
    if (hasChanges(change)) {
      events.push({ action: "code.link_changed", target, metadata: change });
    }
  }
  return events;
}

/**
 * A code moved to another workspace (actions/move-code.ts): "moved to
 * another workspace" in the one it left, "moved here" in the one it joined,
 * each naming the other.
 */
export function recordCodeMove(
  from: { userId: string; organizationId: string },
  code: CodeRef,
  to: { id: string; name: string },
): void {
  recordAuditEvent(
    from,
    codeEvents("code.moved_out", [code], { after: { workspace: to.name } }),
  );
  recordAuditEvent({ userId: from.userId, organizationId: to.id }, async () => {
    const [source] = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, from.organizationId))
      .limit(1);
    return codeEvents("code.moved_in", [code], {
      before: { workspace: source?.name ?? null },
    });
  });
}
