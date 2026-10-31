import { z } from "zod";
import {
  getJob,
  ImportError,
  resetRedirectErrors,
  runRedirects,
} from "@/lib/migrate/importer";
import { isApiProviderId } from "@/lib/migrate/providers";
import {
  deps,
  migrateScope,
  readBody,
  respond,
} from "@/lib/migrate/server/http";
import { getSource } from "@/lib/migrate/server/sources";
import { parseWithSchema } from "@/lib/request-guards";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().trim().min(1).max(64);
const bodySchema = z.object({
  mode: z.enum(["dry-run", "apply", "undo"]),
  /** Clear earlier per-link errors first ("Try again") */
  retry: z.boolean().optional(),
});

/**
 * "Keep my printed codes working": dry-run lists the changes, apply points
 * old links at their QRdx links (≤ 20 per call), undo restores the recorded
 * destinations. Stops with a plain message on plan or quota errors.
 */
export function POST(req: Request, context: Context) {
  return respond("POST /api/migrate/jobs/[id]/redirects", async () => {
    const id = parseWithSchema(idSchema, (await context.params).id);
    const scope = await migrateScope(req, { write: true });
    const { mode, retry } = await readBody(req, bodySchema);
    const { job } = await getJob(deps, scope, id);
    if (!isApiProviderId(job.provider)) {
      throw new ImportError(
        400,
        "NOT_SUPPORTED",
        "Old codes from a file import are re-pointed in the old provider.",
      );
    }
    if (retry) await resetRedirectErrors(deps, scope, id);
    const source =
      mode === "dry-run" ? null : await getSource(scope.userId, job.provider);
    return runRedirects(deps, scope, id, mode, source);
  });
}
