import "server-only";

import { database as db, qrCode, qrCodeVersion } from "@repo/database";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  createPageForCode,
  findScopedPages,
  type PageForCodeInput,
  removeUnattachedPage,
  type ScopedPageRef,
} from "@/app/dashboard/pages/_lib/landing-pages";
import { codeTarget } from "@/ee/audit-log/code-events";
import { changedFields } from "@/ee/audit-log/metadata";
import { type AuditEventInput, recordAuditEvent } from "@/ee/audit-log/record";
import { snapshotCodeVersion } from "@/lib/code-versions";
import { contentTypeForDestination } from "@/lib/dynamic-content";
import { HttpError } from "@/lib/error-response";
import { getTemplate } from "@/lib/landing/templates";
import { assertCan } from "@/lib/permissions-server";
import { screenUrlChange } from "@/lib/safety/destinations";
import { type ActiveScope, isInScope } from "@/lib/scope";
import { SHORT_LINK_BASE } from "@/lib/short-links";
import { KIND_LABELS } from "./code-kind-shared";
import { getCode, type QrCodeView, scopeWhere, updateCode } from "./qr-codes";

// Changing what a printed code opens, keeping its row: the same short link,
// scans, folder, tags, design and link controls. One rule holds everywhere:
// `page_id` is set only while `kind = 'page'`. A page a code stops opening
// stays in Pages (and counts toward the plan's hosted pages until deleted);
// the code's version history remembers it, so the code can switch back
// (rememberedPages, restoreCodeVersion). Routing, UTM and pixels stay
// stored whatever the type; the type decides which of them apply
// (code-kind-shared inactiveOptions).

export type CodeKindChange =
  | { kind: "redirect"; destinationUrl: string }
  | { kind: "page"; pageId: string }
  | { kind: "page"; page: PageForCodeInput };

type CodeRow = typeof qrCode.$inferSelect;

const notFound = (what = "QR code") =>
  new HttpError(404, "NOT_FOUND", `${what} not found`);

/** The address a hosted-page code shows as its destination (as createPage). */
export const pageLinkFor = (slug: string) =>
  `${SHORT_LINK_BASE}/p/${encodeURIComponent(slug)}`;

async function findLiveCode(scope: ActiveScope, id: string): Promise<CodeRow> {
  const [row] = await db
    .select()
    .from(qrCode)
    .where(and(eq(qrCode.id, id), isNull(qrCode.deletedAt)))
    .limit(1);
  // Codes outside the scope (or in the trash) look exactly like missing ones.
  if (!(row && isInScope(scope, row))) throw notFound();
  return row;
}

const pageLabel = (page: { title: string | null; type: string }) =>
  page.title?.trim() || getTemplate(page.type)?.label || "Untitled page";

/**
 * Switches a code to a website link or a hosted page (an existing page of
 * the workspace, or a new one from a template). Saves the previous settings
 * as a version first, records code.type_changed in the audit log and fires
 * code.updated. A new page counts toward the plan's hosted pages, with the
 * same limit error as creating one.
 */
export async function switchCodeKind(
  scope: ActiveScope,
  id: string,
  change: CodeKindChange,
): Promise<QrCodeView> {
  assertCan(scope, "content.write");
  const current = await findLiveCode(scope, id);

  if (change.kind === "redirect") {
    // Already a website link: this is an ordinary destination edit.
    if (current.kind === "redirect") {
      return updateCode(scope, id, { destinationUrl: change.destinationUrl });
    }
    const values: Partial<typeof qrCode.$inferInsert> = {
      kind: "redirect",
      pageId: null,
      destinationUrl: change.destinationUrl,
      contentType: contentTypeForDestination(change.destinationUrl),
    };
    if (
      await screenUrlChange(scope, current, {
        previous: current.destinationUrl,
        next: change.destinationUrl,
      })
    ) {
      values.isActive = false;
    }
    return applySwitch(scope, current, values, {
      before: await pageSummary(scope, current),
      after: {
        type: KIND_LABELS.redirect,
        destinationUrl: change.destinationUrl,
      },
    });
  }

  let page: { id: string; label: string };
  let created = false;
  if ("pageId" in change) {
    const [found] = await findScopedPages(scope, [change.pageId]);
    if (!found) throw notFound("Page");
    if (current.kind === "page" && current.pageId === found.id) {
      return getCode(scope, id);
    }
    page = { id: found.id, label: pageLabel(found) };
  } else {
    const made = await createPageForCode(scope, {
      ...change.page,
      title: change.page.title ?? current.title,
    });
    page = { id: made.pageId, label: pageLabel(made) };
    created = true;
  }

  try {
    const view = await applySwitch(
      scope,
      current,
      {
        kind: "page",
        pageId: page.id,
        destinationUrl: pageLinkFor(current.slug),
        contentType: "url",
      },
      {
        before: await pageSummary(scope, current),
        after: { type: KIND_LABELS.page, page: page.label },
      },
      created
        ? [
            {
              action: "page.created",
              target: { type: "page", id: page.id, label: page.label },
            },
          ]
        : [],
    );
    return view;
  } catch (error) {
    if (created) await removeUnattachedPage(scope, page.id);
    throw error;
  }
}

/** What a code opens, for the audit log's before and after. */
async function pageSummary(
  scope: ActiveScope,
  row: CodeRow,
): Promise<Record<string, string | null>> {
  if (row.kind !== "page") {
    return { type: KIND_LABELS.redirect, destinationUrl: row.destinationUrl };
  }
  const [page] = row.pageId ? await findScopedPages(scope, [row.pageId]) : [];
  return {
    type: KIND_LABELS.page,
    page: page ? pageLabel(page) : "Deleted page",
  };
}

async function applySwitch(
  scope: ActiveScope,
  current: CodeRow,
  values: Partial<typeof qrCode.$inferInsert>,
  summary: {
    before: Record<string, string | null>;
    after: Record<string, string | null>;
  },
  extraEvents: AuditEventInput[] = [],
): Promise<QrCodeView> {
  await snapshotCodeVersion(current.id, scope.userId);
  const [row] = await db
    .update(qrCode)
    .set(values)
    .where(
      and(
        eq(qrCode.id, current.id),
        scopeWhere(scope),
        isNull(qrCode.deletedAt),
      ),
    )
    .returning({ id: qrCode.id });
  if (!row) throw notFound();
  const view = await getCode(scope, current.id);

  const fields = (["kind", "pageId", "destinationUrl"] as const).filter(
    (field) => values[field] !== undefined && values[field] !== current[field],
  );
  // code.updated webhooks + alerts, after the response (never throws).
  (await import("@/lib/events/emit")).emitCodeUpdated(scope, view, [...fields]);
  // Both sides name every field ("destinationUrl" before, "page" after, ...).
  const keys = [
    ...new Set([...Object.keys(summary.before), ...Object.keys(summary.after)]),
  ];
  const side = (values: Record<string, string | null>) =>
    Object.fromEntries(keys.map((key) => [key, values[key] ?? null]));
  recordAuditEvent(scope, [
    ...extraEvents,
    {
      action: "code.type_changed",
      target: codeTarget(view),
      metadata: changedFields(side(summary.before), side(summary.after)),
    },
  ]);
  return view;
}

// ─── What the change-type dialog offers ──────────────────────────────────────

const VERSIONS_SCANNED = 100;

/**
 * Pages this code opened before (newest first) that still exist in the
 * workspace, except the one it opens now: the dialog offers to switch back.
 * Reads two fields of each version, never whole snapshots (designs can
 * hold large inline logos).
 */
export async function rememberedPages(
  scope: ActiveScope,
  code: Pick<QrCodeView, "id" | "pageId">,
  limit = 3,
): Promise<ScopedPageRef[]> {
  const rows = await db
    .select({
      pageId: sql<string | null>`${qrCodeVersion.snapshot}->>'pageId'`,
      createdAt: qrCodeVersion.createdAt,
    })
    .from(qrCodeVersion)
    .where(
      and(
        eq(qrCodeVersion.qrCodeId, code.id),
        sql`${qrCodeVersion.snapshot}->>'kind' = ${"page"}`,
      ),
    )
    .orderBy(desc(qrCodeVersion.createdAt), desc(qrCodeVersion.id))
    .limit(VERSIONS_SCANNED);
  const ids = [
    ...new Set(
      rows.flatMap((row) =>
        row.pageId && row.pageId !== code.pageId ? [row.pageId] : [],
      ),
    ),
  ];
  const pages = new Map(
    (await findScopedPages(scope, ids)).map((page) => [page.id, page]),
  );
  return ids
    .flatMap((pageId) => {
      const page = pages.get(pageId);
      return page ? [page] : [];
    })
    .slice(0, limit);
}

/** The destination the code had when it last was a website link, if ever. */
export async function lastRedirectDestination(
  codeId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      destinationUrl: sql<
        string | null
      >`${qrCodeVersion.snapshot}->>'destinationUrl'`,
    })
    .from(qrCodeVersion)
    .where(
      and(
        eq(qrCodeVersion.qrCodeId, codeId),
        sql`${qrCodeVersion.snapshot}->>'kind' = ${"redirect"}`,
      ),
    )
    .orderBy(desc(qrCodeVersion.createdAt), desc(qrCodeVersion.id))
    .limit(1);
  return row?.destinationUrl ?? null;
}
