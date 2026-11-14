import { z } from "zod";
import { handleError } from "@/lib/error-response";
import { MAX_BODY_BYTES, NO_STORE, resolveUploadScope } from "@/lib/files/http";
import {
  assertStorageConfigured,
  createUpload,
  createUploadSchema,
  FILES_PAGE_SIZE,
  listFilesPage,
} from "@/lib/files/service";
import { FILE_KINDS } from "@/lib/files/types";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";

const listQuerySchema = z.object({
  kind: z.enum(FILE_KINDS).optional(),
  /** `nextCursor` from the previous page; omit for the first */
  cursor: z.string().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(FILES_PAGE_SIZE),
});

/**
 * Ready files of the active workspace (`?kind=pdf|image|audio|video`),
 * newest first, a page at a time: `{ data, nextCursor }`, and
 * `?cursor=<nextCursor>` for the page after (null after the last).
 */
export async function GET(req: Request) {
  try {
    assertStorageConfigured();
    const scope = await resolveUploadScope(req, { write: false });
    const { kind, cursor, limit } = parseWithSchema(
      listQuerySchema,
      Object.fromEntries(new URL(req.url).searchParams),
    );
    const page = await listFilesPage(scope, {
      kind,
      readyOnly: true,
      cursor,
      limit,
    });
    return Response.json(
      { data: page.items, nextCursor: page.nextCursor },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "GET /api/files" });
  }
}

/**
 * Starts an upload: `{ filename, mime, size, replaceId? }` → a pending file
 * plus a presigned PUT. Upload the bytes with exactly `upload.headers`, then
 * POST /api/files/<id>/finalize. 503 when storage isn't configured.
 */
export async function POST(req: Request) {
  try {
    assertStorageConfigured();
    const scope = await resolveUploadScope(req);
    const input = parseWithSchema(
      createUploadSchema,
      await readJsonBody(req, MAX_BODY_BYTES),
    );
    const { file, upload } = await createUpload(scope, input);
    return Response.json(
      {
        file,
        upload: { ...upload, expiresAt: upload.expiresAt.toISOString() },
      },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "POST /api/files" });
  }
}
