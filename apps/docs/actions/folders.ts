"use server";

import { z } from "zod";
import {
  createFolder,
  deleteFolder,
  folderNameSchema,
  idSchema,
  listFolders,
  moveFolder,
  type OrganizeResult,
  parseInput,
  renameFolder,
  runOrganize,
} from "@/app/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/dashboard/codes/_lib/organize-shared";

const parentSchema = idSchema.nullable();

const createSchema = z.object({
  name: folderNameSchema,
  parentId: parentSchema,
});
const renameSchema = z.object({ id: idSchema, name: folderNameSchema });
const moveSchema = z.object({ id: idSchema, parentId: parentSchema });
const idOnlySchema = z.object({ id: idSchema });

export async function listCodeFolders(): Promise<OrganizeResult<FolderRow[]>> {
  return runOrganize("listCodeFolders", listFolders, { revalidate: false });
}

export async function createCodeFolder(
  input: z.input<typeof createSchema>,
): Promise<OrganizeResult<FolderRow>> {
  return runOrganize("createCodeFolder", (scope) =>
    createFolder(scope, parseInput(createSchema, input)),
  );
}

export async function renameCodeFolder(
  input: z.input<typeof renameSchema>,
): Promise<OrganizeResult<void>> {
  return runOrganize("renameCodeFolder", (scope) =>
    renameFolder(scope, parseInput(renameSchema, input)),
  );
}

export async function moveCodeFolder(
  input: z.input<typeof moveSchema>,
): Promise<OrganizeResult<void>> {
  return runOrganize("moveCodeFolder", (scope) =>
    moveFolder(scope, parseInput(moveSchema, input)),
  );
}

/** Codes and subfolders of the folder move up to its parent. */
export async function deleteCodeFolder(
  input: z.input<typeof idOnlySchema>,
): Promise<OrganizeResult<{ parentId: string | null }>> {
  return runOrganize("deleteCodeFolder", (scope) =>
    deleteFolder(scope, parseInput(idOnlySchema, input).id),
  );
}
