import { getCodeUsage } from "@/app/dashboard/codes/_lib/qr-codes";
import { getDomainOptions } from "@/app/dashboard/domains/_lib/domains";
import { migrateScope, respond } from "@/lib/migrate/server/http";
import { providerStatuses } from "@/lib/migrate/server/sources";

export const dynamic = "force-dynamic";

/** Connection state of each API provider, plus the plan room for new codes. */
export function GET(req: Request) {
  return respond("GET /api/migrate/providers", async () => {
    const scope = await migrateScope(req);
    const [providers, usage, domains] = await Promise.all([
      providerStatuses(scope.userId),
      getCodeUsage(scope),
      getDomainOptions(scope),
    ]);
    return {
      providers,
      usage: {
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
        remaining:
          usage.limit === null ? null : Math.max(0, usage.limit - usage.used),
      },
      domains,
    };
  });
}
