import { recordCronRun } from "@/lib/cron-runs";
import { runIntegrationSyncs } from "@/lib/data-connections/sync";
import { isAuthorizedCronRequest, unauthorized } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Data-out worker: appends new scans to synced Google Sheets and sends new
 * form responses to HubSpot / Mailchimp, retrying failed streams with
 * backoff. Also run by /api/cron/webhooks; schedule this route separately
 * for more frequent syncs.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return unauthorized();
  const startedAt = Date.now();
  const summary = await runIntegrationSyncs({ budgetMs: 45_000 });
  console.info(JSON.stringify({ event: "cron.integrations", ...summary }));
  await recordCronRun("integrations", startedAt);
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}
