import { listJobs, startJob } from "@/lib/migrate/importer";
import {
  deps,
  migrateScope,
  readBody,
  respond,
} from "@/lib/migrate/server/http";
import { startJobSchema } from "@/lib/migrate/types";

export const dynamic = "force-dynamic";

/** Recent imports into the active workspace (for resuming and undo). */
export function GET(req: Request) {
  return respond("GET /api/migrate/jobs", async () => {
    const scope = await migrateScope(req);
    return listJobs(deps, scope);
  });
}

/** Plans the import again on the server and records it; run it with /run. */
export function POST(req: Request) {
  return respond("POST /api/migrate/jobs", async () => {
    const scope = await migrateScope(req, { write: true });
    const request = await readBody(req, startJobSchema);
    return startJob(deps, scope, request);
  });
}
