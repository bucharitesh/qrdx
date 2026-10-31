import { z } from "zod";
import { enforceCreateRateLimit } from "@/app/dashboard/codes/_lib/qr-codes";
import { runJobChunk } from "@/lib/migrate/importer";
import { deps, migrateScope, respond } from "@/lib/migrate/server/http";
import { parseWithSchema } from "@/lib/request-guards";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().trim().min(1).max(64);

/**
 * Creates the next ≤ 50 codes of an import. Call again until `done`; a
 * retried or resumed call never creates a code twice.
 */
export function POST(req: Request, context: Context) {
  return respond("POST /api/migrate/jobs/[id]/run", async () => {
    const id = parseWithSchema(idSchema, (await context.params).id);
    const scope = await migrateScope(req, { write: true });
    // The same per-user cap as every other way of creating codes.
    await enforceCreateRateLimit(scope.userId);
    return runJobChunk(deps, scope, id);
  });
}
