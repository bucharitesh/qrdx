"use server";

import { z } from "zod";
import {
  duplicateCode,
  emptyTrash,
  idSchema,
  idsSchema,
  moveCodes,
  notesSchema,
  type OrganizeResult,
  parseInput,
  purgeCodes,
  restoreCodes,
  runOrganize,
  setArchived,
  setFavorite,
  setNotes,
  setPaused,
  trashCodes,
} from "@/app/(app)/dashboard/codes/_lib/organize";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  type ImportChunkResult,
  type ImportPreview,
  importChunk,
  importChunkSchema,
  importPreviewSchema,
  previewImport,
} from "@/app/(app)/dashboard/codes/import/_lib/import";
import { type RestoreResult, restoreCodeVersion } from "@/lib/code-versions";

type Counted = { updated: number };
type CountedWithSkips = Counted & { skipped: number };

const idsOnly = z.object({ ids: idsSchema });
const favoriteSchema = z.object({ ids: idsSchema, favorite: z.boolean() });
const pausedSchema = z.object({ ids: idsSchema, paused: z.boolean() });
const archivedSchema = z.object({ ids: idsSchema, archived: z.boolean() });
const moveSchema = z.object({ ids: idsSchema, folderId: idSchema.nullable() });
const notesInputSchema = z.object({ id: idSchema, notes: notesSchema });
const idOnly = z.object({ id: idSchema });
const restoreVersionSchema = z.object({
  codeId: idSchema,
  versionId: idSchema,
});

export async function setQrCodesFavorite(
  input: z.input<typeof favoriteSchema>,
): Promise<OrganizeResult<Counted>> {
  return runOrganize("setQrCodesFavorite", (scope) => {
    const { ids, favorite } = parseInput(favoriteSchema, input);
    return setFavorite(scope, ids, favorite);
  });
}

export async function setQrCodeNotes(
  input: z.input<typeof notesInputSchema>,
): Promise<OrganizeResult<void>> {
  return runOrganize("setQrCodeNotes", (scope) => {
    const { id, notes } = parseInput(notesInputSchema, input);
    return setNotes(scope, id, notes);
  });
}

export async function moveQrCodes(
  input: z.input<typeof moveSchema>,
): Promise<OrganizeResult<Counted>> {
  return runOrganize("moveQrCodes", (scope) => {
    const { ids, folderId } = parseInput(moveSchema, input);
    return moveCodes(scope, ids, folderId);
  });
}

/** Pause works on every plan; paused codes show the owner's fallback. */
export async function setQrCodesPaused(
  input: z.input<typeof pausedSchema>,
): Promise<OrganizeResult<Counted>> {
  return runOrganize("setQrCodesPaused", (scope) => {
    const { ids, paused } = parseInput(pausedSchema, input);
    return setPaused(scope, ids, paused);
  });
}

export async function setQrCodesArchived(
  input: z.input<typeof archivedSchema>,
): Promise<OrganizeResult<Counted>> {
  return runOrganize("setQrCodesArchived", (scope) => {
    const { ids, archived } = parseInput(archivedSchema, input);
    return setArchived(scope, ids, archived);
  });
}

export async function trashQrCodes(
  input: z.input<typeof idsOnly>,
): Promise<OrganizeResult<CountedWithSkips>> {
  return runOrganize("trashQrCodes", (scope) =>
    trashCodes(scope, parseInput(idsOnly, input).ids),
  );
}

export async function restoreQrCodes(
  input: z.input<typeof idsOnly>,
): Promise<OrganizeResult<Counted>> {
  return runOrganize("restoreQrCodes", (scope) =>
    restoreCodes(scope, parseInput(idsOnly, input).ids),
  );
}

export async function purgeQrCodes(
  input: z.input<typeof idsOnly>,
): Promise<OrganizeResult<CountedWithSkips>> {
  return runOrganize("purgeQrCodes", (scope) =>
    purgeCodes(scope, parseInput(idsOnly, input).ids),
  );
}

export async function emptyQrCodeTrash(): Promise<OrganizeResult<Counted>> {
  return runOrganize("emptyQrCodeTrash", emptyTrash);
}

export async function duplicateQrCode(
  input: z.input<typeof idOnly>,
): Promise<OrganizeResult<QrCodeView>> {
  return runOrganize("duplicateQrCode", (scope) =>
    duplicateCode(scope, parseInput(idOnly, input).id),
  );
}

/** Puts a past version back; the current settings become a version first. */
export async function restoreQrCodeVersion(
  input: z.input<typeof restoreVersionSchema>,
): Promise<OrganizeResult<RestoreResult>> {
  return runOrganize("restoreQrCodeVersion", (scope) => {
    const { codeId, versionId } = parseInput(restoreVersionSchema, input);
    return restoreCodeVersion(scope, codeId, versionId);
  });
}

export async function previewQrCodeImport(
  input: z.input<typeof importPreviewSchema>,
): Promise<OrganizeResult<ImportPreview>> {
  return runOrganize(
    "previewQrCodeImport",
    (scope) => {
      const { rows, domainId } = parseInput(importPreviewSchema, input);
      return previewImport(scope, rows, domainId ?? null);
    },
    { revalidate: false },
  );
}

/**
 * One chunk (IMPORT_CHUNK_SIZE rows) of a CSV import; the client sends chunks
 * in order, each under its own idempotency key, so a chunk sent again (a
 * retry, a resume after a reload) never makes its codes twice.
 */
export async function importQrCodesChunk(
  input: z.input<typeof importChunkSchema>,
): Promise<OrganizeResult<ImportChunkResult>> {
  return runOrganize("importQrCodesChunk", (scope) => {
    const { rows, domainId, folderId, tagIds, idempotencyKey } = parseInput(
      importChunkSchema,
      input,
    );
    return importChunk(scope, rows, domainId, {
      folderId,
      tagIds,
      idempotencyKey,
    });
  });
}
