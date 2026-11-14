import "server-only";

import type { FileRow } from "@/app/(app)/dashboard/files/_components/files-manager";
import { getFileUsage, listFilesPage } from "@/lib/files/service";
import type { FileKind } from "@/lib/files/types";
import type { CursorPage } from "@/lib/keyset-cursor";
import type { ActiveScope } from "@/lib/scope";

/**
 * A page of the Files list: the files, newest first, each with where the
 * workspace uses it. Usage is looked up for this page's files only.
 */
export async function loadFileRows(
  scope: ActiveScope,
  options: { kind?: FileKind; cursor?: string | null; limit?: number } = {},
): Promise<CursorPage<FileRow>> {
  const page = await listFilesPage(scope, options);
  const usage = await getFileUsage(
    scope,
    page.items.map((file) => file.id),
  );
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((file) => ({
      ...file,
      pages: usage.get(file.id)?.pages ?? [],
      codeCount: usage.get(file.id)?.codeCount ?? 0,
    })),
  };
}
