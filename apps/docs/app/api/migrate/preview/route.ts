import { previewImport } from "@/lib/migrate/importer";
import {
  deps,
  migrateScope,
  readBody,
  respond,
} from "@/lib/migrate/server/http";
import { previewRequestSchema } from "@/lib/migrate/types";

export const dynamic = "force-dynamic";

/** What an import would create, skip and keep, before anything is written. */
export function POST(req: Request) {
  return respond("POST /api/migrate/preview", async () => {
    const scope = await migrateScope(req, { write: true });
    const request = await readBody(req, previewRequestSchema);
    return previewImport(deps, scope, request);
  });
}
