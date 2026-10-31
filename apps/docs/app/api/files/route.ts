import { z } from "zod";
import { handleError } from "@/lib/error-response";
import { MAX_BODY_BYTES, NO_STORE, resolveUploadScope } from "@/lib/files/http";
import {
  assertStorageConfigured,
  createUpload,
  createUploadSchema,
  listPickerFiles,
} from "@/lib/files/service";
import { FILE_KINDS } from "@/lib/files/types";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";

const listQuerySchema = z.object({ kind: z.enum(FILE_KINDS).optional() });

/** Ready files of the active workspace (`?kind=pdf|image|audio|video`), newest first. */
export async function GET(req: Request) {
  try {
    assertStorageConfigured();
    const scope = await resolveUploadScope(req, { write: false });
    const { kind } = parseWithSchema(
      listQuerySchema,
      Object.fromEntries(new URL(req.url).searchParams),
    );
    return Response.json(
      { data: await listPickerFiles(scope, kind) },
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
