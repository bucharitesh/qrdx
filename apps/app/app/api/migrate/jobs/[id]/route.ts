import { z } from "zod";
import { getJob } from "@/lib/migrate/importer";
import { deps, migrateScope, respond } from "@/lib/migrate/server/http";
import { parseWithSchema } from "@/lib/request-guards";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().trim().min(1).max(64);

/** One import with every link's outcome (summary, mapping, undo state). */
export function GET(req: Request, context: Context) {
  return respond("GET /api/migrate/jobs/[id]", async () => {
    const id = parseWithSchema(idSchema, (await context.params).id);
    const scope = await migrateScope(req);
    return getJob(deps, scope, id);
  });
}
