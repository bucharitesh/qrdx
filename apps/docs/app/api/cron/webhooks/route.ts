import { runIntegrationSyncs } from "@/lib/data-connections/sync";
import { pruneDeliveries, runDeliveryWorker } from "@/lib/events/deliveries";
import { isAuthorizedCronRequest, unauthorized } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook worker (vercel.json: every 5 minutes): retries due deliveries with
 * exponential backoff, sends scan batches whose window closed, prunes
 * deliveries older than 30 days.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return unauthorized();

  const summary = await runDeliveryWorker({ budgetMs: 40_000 });
  let pruned = 0;
  try {
    pruned = await pruneDeliveries();
  } catch (error) {
    console.error("Pruning webhook deliveries failed:", error);
  }
  // Data-out streams (Google Sheets, HubSpot, Mailchimp) ride the same cron.
  const integrations = await runIntegrationSyncs({ budgetMs: 12_000 });
  console.info(
    JSON.stringify({ event: "cron.webhooks", ...summary, pruned, integrations }),
  );
  return Response.json(
    { ...summary, pruned },
    { headers: { "Cache-Control": "no-store" } },
  );
}
