import { z } from "zod";
import { attachJobDomain } from "@/lib/migrate/importer";
import { deps, migrateScope, respond } from "@/lib/migrate/server/http";
import { parseWithSchema } from "@/lib/request-guards";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().trim().min(1).max(64);

/**
 * After the DNS move: puts the codes that kept their back-halves on the
 * verified QRdx custom domain, so go.brand.com/<back-half> resolves again.
 */
export function POST(req: Request, context: Context) {
  return respond("POST /api/migrate/jobs/[id]/domain", async () => {
    const id = parseWithSchema(idSchema, (await context.params).id);
    const scope = await migrateScope(req, { write: true });
    return attachJobDomain(deps, scope, id);
  });
}
