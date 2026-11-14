import "server-only";

// Saved barcodes: static barcodes kept in a workspace to edit and download
// again (the `barcode` table, manual-sql/2026-11-11-barcodes.sql). Every
// read and write is scoped to the caller's workspace; rows outside it look
// missing. Used by the dashboard (actions/barcodes.ts), the REST API
// (/v1/barcodes) and MCP (save_barcode). Changes are recorded in the
// workspace audit log.
import { barcode, database as db, folder } from "@repo/database";
import cuid from "cuid";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { changedFields, hasChanges } from "@/ee/audit-log/metadata";
import { recordAuditEvent } from "@/ee/audit-log/record";
import {
  type BarcodeFormatId,
  getBarcodeFormat,
  isBarcodeFormatId,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import {
  type BarcodeStyle,
  resolveBarcodeStyle,
  storedBarcodeStyle,
  styleChanges,
} from "@/lib/barcode/style";
import { HttpError } from "@/lib/error-response";
import { can } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions-server";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { ValidationError } from "@/types/errors";
import {
  type CreateBarcodeInput,
  type ListBarcodesQuery,
  MAX_BARCODE_BULK,
  MAX_BARCODE_TITLE,
  type UpdateBarcodeInput,
} from "./schema";

type Row = typeof barcode.$inferSelect;

export interface BarcodeView {
  id: string;
  title: string | null;
  format: BarcodeFormatId;
  /** The value drawn, check digit included */
  value: string;
  /** Every drawing option, defaults filled in */
  options: BarcodeStyle;
  folderId: string | null;
  /** Who made it (user id) */
  createdBy: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** In the trash since; null when not */
  deletedAt: Date | null;
}

export interface BarcodeUsage {
  plan: Plan;
  /** Saved barcodes, not counting the trash */
  used: number;
  /** null = unlimited */
  limit: number | null;
}

const notFound = () => new HttpError(404, "NOT_FOUND", "Barcode not found");

/** Rows of the caller's workspace. */
export const barcodeScopeWhere = (scope: ActiveScope): SQL =>
  scope.organizationId
    ? eq(barcode.organizationId, scope.organizationId)
    : (and(
        eq(barcode.userId, scope.userId),
        isNull(barcode.organizationId),
      ) as SQL);

/** Owners and admins act on everything in a team; members on what they made. */
const canManageAll = (scope: ActiveScope) =>
  !scope.organizationId || can(scope.role, "content.manageAll");

const deletableWhere = (scope: ActiveScope): SQL | undefined =>
  canManageAll(scope) ? undefined : eq(barcode.userId, scope.userId);

export function toBarcodeView(row: Row): BarcodeView {
  // An unknown format (a newer app wrote it) reads as Code 128 text rather
  // than breaking the list; it can't be drawn as anything else here.
  const format: BarcodeFormatId = isBarcodeFormatId(row.format)
    ? row.format
    : "code128";
  return {
    id: row.id,
    title: row.title,
    format,
    value: row.value,
    options: storedBarcodeStyle(format, row.options),
    folderId: row.folderId,
    createdBy: row.userId,
    organizationId: row.organizationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** A name for lists and the audit log: the title, else "EAN-13 5901234123457". */
export function barcodeLabel(
  view: Pick<BarcodeView, "title" | "format" | "value">,
) {
  if (view.title) return view.title;
  const value =
    view.value.length > 40 ? `${view.value.slice(0, 39)}…` : view.value;
  return `${getBarcodeFormat(view.format).label} ${value}`;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

async function countSaved(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(barcode)
    .where(and(barcodeScopeWhere(scope), isNull(barcode.deletedAt)));
  return row?.total ?? 0;
}

export async function countBarcodeTrash(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(barcode)
    .where(and(barcodeScopeWhere(scope), isNotNull(barcode.deletedAt)));
  return row?.total ?? 0;
}

export async function getBarcodeUsage(
  scope: ActiveScope,
): Promise<BarcodeUsage> {
  const [plan, used] = await Promise.all([
    getPlanForScope(scope),
    countSaved(scope),
  ]);
  const limit = getPlanLimits(plan).savedBarcodes;
  return { plan, used, limit: Number.isFinite(limit) ? limit : null };
}

/** `%`, `_` and `\` match themselves in a search. */
const likePattern = (term: string) =>
  `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export async function listBarcodes(
  scope: ActiveScope,
  query: ListBarcodesQuery,
): Promise<{ barcodes: BarcodeView[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    barcodeScopeWhere(scope),
    query.status === "trash"
      ? isNotNull(barcode.deletedAt)
      : isNull(barcode.deletedAt),
  ];
  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(
      or(ilike(barcode.title, pattern), ilike(barcode.value, pattern)),
    );
  }
  if (query.format) conditions.push(eq(barcode.format, query.format));
  if (query.folderId === "none") conditions.push(isNull(barcode.folderId));
  else if (query.folderId)
    conditions.push(eq(barcode.folderId, query.folderId));
  const where = and(...conditions);

  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(barcode)
      .where(where)
      .orderBy(desc(barcode.updatedAt), desc(barcode.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(barcode).where(where),
  ]);
  return { barcodes: rows.map(toBarcodeView), total: totals?.total ?? 0 };
}

async function findRow(
  scope: ActiveScope,
  id: string,
  { trashed = false }: { trashed?: boolean } = {},
): Promise<Row> {
  const [row] = await db
    .select()
    .from(barcode)
    .where(and(eq(barcode.id, id), barcodeScopeWhere(scope)))
    .limit(1);
  if (!row || (!trashed && row.deletedAt)) throw notFound();
  return row;
}

/** One saved barcode; trashed ones only with `trashed`. */
export async function getBarcode(
  scope: ActiveScope,
  id: string,
  options: { trashed?: boolean } = {},
): Promise<BarcodeView> {
  return toBarcodeView(await findRow(scope, id, options));
}

// ─── Checks ──────────────────────────────────────────────────────────────────

/** The value as drawn and the full style, or a 400 naming the field. */
function checkContent(
  format: BarcodeFormatId,
  rawValue: string,
  options: Partial<BarcodeStyle> | undefined,
): { value: string; options: BarcodeStyle } {
  const checked = validateBarcodeInput(format, rawValue);
  if (!checked.ok) {
    throw new ValidationError(checked.error, [
      { path: "value", message: checked.error },
    ]);
  }
  const style = resolveBarcodeStyle(format, options);
  if (!style.ok) {
    throw new ValidationError(style.message, [
      { path: `options.${style.field}`, message: style.message },
    ]);
  }
  return { value: checked.value, options: style.style };
}

async function assertFolder(
  scope: ActiveScope,
  folderId: string | null | undefined,
) {
  if (!folderId) return;
  const [row] = await db
    .select({ id: folder.id })
    .from(folder)
    .where(
      and(
        eq(folder.id, folderId),
        scope.organizationId
          ? eq(folder.organizationId, scope.organizationId)
          : (and(
              eq(folder.userId, scope.userId),
              isNull(folder.organizationId),
            ) as SQL),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ValidationError("That folder isn't in this workspace.", [
      { path: "folderId", message: "Not a folder of this workspace" },
    ]);
  }
}

function limitReached(limit: number): HttpError {
  return new HttpError(
    402,
    "LIMIT_REACHED",
    `This workspace has ${limit.toLocaleString("en-US")} saved barcodes, its plan's limit. Delete some (and empty the trash) to save more.`,
  );
}

async function assertRoom(scope: ActiveScope, adding: number) {
  const usage = await getBarcodeUsage(scope);
  if (usage.limit !== null && usage.used + adding > usage.limit) {
    throw limitReached(usage.limit);
  }
}

/** What's stored: only the options that differ from the format's defaults. */
const storedOptions = (format: BarcodeFormatId, options: BarcodeStyle) =>
  styleChanges(format, options) as Record<string, unknown>;

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function createBarcode(
  scope: ActiveScope,
  input: CreateBarcodeInput,
): Promise<BarcodeView> {
  assertCan(scope, "content.write");
  const content = checkContent(input.format, input.value, input.options);
  await Promise.all([
    assertFolder(scope, input.folderId),
    assertRoom(scope, 1),
  ]);
  const now = new Date();
  const [row] = await db
    .insert(barcode)
    .values({
      id: cuid(),
      userId: scope.userId,
      organizationId: scope.organizationId,
      folderId: input.folderId ?? null,
      title: input.title,
      format: input.format,
      value: content.value,
      options: storedOptions(input.format, content.options),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("Saving the barcode returned nothing");
  const view = toBarcodeView(row);
  recordAuditEvent(scope, {
    action: "barcode.created",
    target: { type: "barcode", id: view.id, label: barcodeLabel(view) },
    metadata: { format: view.format },
  });
  return view;
}

export async function updateBarcode(
  scope: ActiveScope,
  id: string,
  patch: UpdateBarcodeInput,
): Promise<BarcodeView> {
  assertCan(scope, "content.write");
  const current = toBarcodeView(await findRow(scope, id));
  const format = patch.format ?? current.format;
  const formatChanged = format !== current.format;
  // A new format redraws with its own defaults unless options come along.
  const options =
    patch.options ?? (formatChanged ? undefined : current.options);
  const content = checkContent(format, patch.value ?? current.value, options);
  if (patch.folderId !== undefined) await assertFolder(scope, patch.folderId);

  const [row] = await db
    .update(barcode)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
      format,
      value: content.value,
      options: storedOptions(format, content.options),
      updatedAt: new Date(),
    })
    .where(and(eq(barcode.id, id), barcodeScopeWhere(scope)))
    .returning();
  if (!row) throw notFound();
  const view = toBarcodeView(row);

  const change = changedFields(
    { title: current.title, format: current.format, value: current.value },
    {
      title: patch.title === undefined ? undefined : view.title,
      format: view.format,
      value: view.value,
    },
  );
  const designChanged =
    JSON.stringify(storedOptions(current.format, current.options)) !==
      JSON.stringify(storedOptions(view.format, view.options)) || formatChanged;
  if (hasChanges(change) || designChanged) {
    recordAuditEvent(scope, {
      action: "barcode.updated",
      target: { type: "barcode", id, label: barcodeLabel(view) },
      metadata: { ...change, ...(designChanged ? { design: true } : {}) },
    });
  }
  if (patch.folderId !== undefined && patch.folderId !== current.folderId) {
    recordAuditEvent(scope, {
      action: "barcode.moved_to_folder",
      target: { type: "barcode", id, label: barcodeLabel(view) },
    });
  }
  return view;
}

function copyTitle(view: BarcodeView): string {
  const base = barcodeLabel(view);
  const suffix = " (copy)";
  return base.length + suffix.length > MAX_BARCODE_TITLE
    ? `${base.slice(0, MAX_BARCODE_TITLE - suffix.length - 1)}…${suffix}`
    : `${base}${suffix}`;
}

/** A copy with the same format, value, options and folder; " (copy)" on the title. */
export async function duplicateBarcode(
  scope: ActiveScope,
  id: string,
): Promise<BarcodeView> {
  const source = toBarcodeView(await findRow(scope, id));
  return createBarcode(scope, {
    title: copyTitle(source),
    format: source.format,
    value: source.value,
    options: source.options,
    folderId: source.folderId,
  });
}

const ids = (list: string[]) => [...new Set(list)].slice(0, MAX_BARCODE_BULK);

const auditMany = (
  scope: ActiveScope,
  action:
    | "barcode.trashed"
    | "barcode.restored"
    | "barcode.deleted"
    | "barcode.moved_to_folder",
  rows: Row[],
) => {
  if (rows.length === 0) return;
  recordAuditEvent(
    scope,
    rows.map((row) => ({
      action,
      target: {
        type: "barcode" as const,
        id: row.id,
        label: barcodeLabel(toBarcodeView(row)),
      },
    })),
  );
};

/** Moves barcodes to the trash (restorable). Members only trash their own. */
export async function trashBarcodes(scope: ActiveScope, list: string[]) {
  assertCan(scope, "content.write");
  const wanted = ids(list);
  if (wanted.length === 0) return { updated: 0, skipped: 0 };
  const rows = await db
    .update(barcode)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(barcode.id, wanted),
        barcodeScopeWhere(scope),
        isNull(barcode.deletedAt),
        deletableWhere(scope),
      ),
    )
    .returning();
  auditMany(scope, "barcode.trashed", rows);
  return { updated: rows.length, skipped: wanted.length - rows.length };
}

/** Back from the trash, as long as the plan has room for them. */
export async function restoreBarcodes(scope: ActiveScope, list: string[]) {
  assertCan(scope, "content.write");
  const wanted = ids(list);
  if (wanted.length === 0) return { updated: 0, skipped: 0 };
  const where = and(
    inArray(barcode.id, wanted),
    barcodeScopeWhere(scope),
    isNotNull(barcode.deletedAt),
    deletableWhere(scope),
  );
  const [trashed] = await db
    .select({ total: count() })
    .from(barcode)
    .where(where);
  await assertRoom(scope, trashed?.total ?? 0);
  const rows = await db
    .update(barcode)
    .set({ deletedAt: null })
    .where(where)
    .returning();
  auditMany(scope, "barcode.restored", rows);
  return { updated: rows.length, skipped: wanted.length - rows.length };
}

/** Deletes barcodes for good: from the trash, or straight away with `anywhere`. */
export async function purgeBarcodes(
  scope: ActiveScope,
  list: string[],
  { anywhere = false }: { anywhere?: boolean } = {},
) {
  assertCan(scope, "content.write");
  const wanted = ids(list);
  if (wanted.length === 0) return { updated: 0, skipped: 0 };
  const rows = await db
    .delete(barcode)
    .where(
      and(
        inArray(barcode.id, wanted),
        barcodeScopeWhere(scope),
        anywhere ? undefined : isNotNull(barcode.deletedAt),
        deletableWhere(scope),
      ),
    )
    .returning();
  auditMany(scope, "barcode.deleted", rows);
  return { updated: rows.length, skipped: wanted.length - rows.length };
}

export async function emptyBarcodeTrash(scope: ActiveScope) {
  assertCan(scope, "content.write");
  const rows = await db
    .delete(barcode)
    .where(
      and(
        barcodeScopeWhere(scope),
        isNotNull(barcode.deletedAt),
        deletableWhere(scope),
      ),
    )
    .returning();
  auditMany(scope, "barcode.deleted", rows);
  return { updated: rows.length };
}

/** Moves barcodes into a folder of the workspace, or out of folders (null). */
export async function moveBarcodes(
  scope: ActiveScope,
  list: string[],
  folderId: string | null,
) {
  assertCan(scope, "content.write");
  const wanted = ids(list);
  if (wanted.length === 0) return { updated: 0 };
  await assertFolder(scope, folderId);
  const rows = await db
    .update(barcode)
    .set({ folderId, updatedAt: new Date() })
    .where(
      and(
        inArray(barcode.id, wanted),
        barcodeScopeWhere(scope),
        isNull(barcode.deletedAt),
      ),
    )
    .returning();
  auditMany(scope, "barcode.moved_to_folder", rows);
  return { updated: rows.length };
}
