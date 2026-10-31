import { handleError } from "@/lib/error-response";
import { MAX_BODY_BYTES, NO_STORE, resolveUploadScope } from "@/lib/files/http";
import {
  assertStorageConfigured,
  finalizeUpload,
  finalizeUploadSchema,
} from "@/lib/files/service";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";

type Context = { params: Promise<{ id: string }> };

/**
 * Finishes an upload after the PUT: checks the stored object (size, type,
 * magic bytes) and marks the file ready, or rejects it. Body:
 * `{ replaceId? }` to put the new content behind an existing file's link.
 */
export async function POST(req: Request, { params }: Context) {
  try {
    assertStorageConfigured();
    const { id } = await params;
    const scope = await resolveUploadScope(req);
    const { replaceId } = parseWithSchema(
      finalizeUploadSchema,
      await readJsonBody(req, MAX_BODY_BYTES),
    );
    const file = await finalizeUpload(scope, id, { replaceId });
    return Response.json({ file }, { headers: NO_STORE });
  } catch (error) {
    return handleError(error, { route: "POST /api/files/[id]/finalize" });
  }
}
