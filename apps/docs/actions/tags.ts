"use server";

import { z } from "zod";
import {
  createTag,
  deleteTag,
  idSchema,
  idsSchema,
  listTags,
  type OrganizeResult,
  parseInput,
  runOrganize,
  setCodeTags,
  type TagRow,
  tagCodes,
  tagColorSchema,
  tagNameSchema,
  updateTag,
} from "@/app/dashboard/codes/_lib/organize";
import { MAX_TAGS_PER_CODE } from "@/app/dashboard/codes/_lib/organize-shared";

const createSchema = z.object({
  name: tagNameSchema,
  color: tagColorSchema.default("gray"),
});

const updateSchema = z
  .object({
    id: idSchema,
    name: tagNameSchema.optional(),
    color: tagColorSchema.optional(),
  })
  .refine((input) => input.name !== undefined || input.color !== undefined, {
    message: "Nothing to update",
  });

const idOnlySchema = z.object({ id: idSchema });

const tagIdsSchema = z.array(idSchema).max(MAX_TAGS_PER_CODE * 2);

const setSchema = z.object({
  codeId: idSchema,
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_CODE, `A code can have up to ${MAX_TAGS_PER_CODE} tags.`),
});

const bulkSchema = z
  .object({
    ids: idsSchema,
    add: tagIdsSchema.default([]),
    remove: tagIdsSchema.default([]),
  })
  .refine((input) => input.add.length + input.remove.length > 0, {
    message: "Choose a tag to add or remove",
  });

export async function listCodeTags(): Promise<OrganizeResult<TagRow[]>> {
  return runOrganize("listCodeTags", listTags, { revalidate: false });
}

export async function createCodeTag(
  input: z.input<typeof createSchema>,
): Promise<OrganizeResult<TagRow>> {
  return runOrganize("createCodeTag", (scope) =>
    createTag(scope, parseInput(createSchema, input)),
  );
}

export async function updateCodeTag(
  input: z.input<typeof updateSchema>,
): Promise<OrganizeResult<void>> {
  return runOrganize("updateCodeTag", (scope) =>
    updateTag(scope, parseInput(updateSchema, input)),
  );
}

export async function deleteCodeTag(
  input: z.input<typeof idOnlySchema>,
): Promise<OrganizeResult<void>> {
  return runOrganize("deleteCodeTag", (scope) =>
    deleteTag(scope, parseInput(idOnlySchema, input).id),
  );
}

/** Replaces the tags of one code. */
export async function setQrCodeTags(
  input: z.input<typeof setSchema>,
): Promise<OrganizeResult<void>> {
  return runOrganize("setQrCodeTags", (scope) => {
    const { codeId, tagIds } = parseInput(setSchema, input);
    return setCodeTags(scope, codeId, tagIds);
  });
}

/** Adds and/or removes tags on several codes. */
export async function tagQrCodes(
  input: z.input<typeof bulkSchema>,
): Promise<OrganizeResult<{ updated: number }>> {
  return runOrganize("tagQrCodes", (scope) => {
    const { ids, add, remove } = parseInput(bulkSchema, input);
    return tagCodes(scope, ids, { add, remove });
  });
}
