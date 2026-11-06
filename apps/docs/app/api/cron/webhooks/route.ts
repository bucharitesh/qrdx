import { pruneExpiredVerifications } from "@/lib/auth/verification-prune";
import { recordCronCheck, recordCronRun } from "@/lib/cron-runs";
import {
  nextIntegrationSyncDueAt,
  runIntegrationSyncs,
} from "@/lib/data-connections/sync";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import {
  nextDeliveryDueAt,
  pruneDeliveries,
  runDeliveryWorker,
} from "@/lib/events/deliveries";
import { checkWorkerDue, reseedWorkerDue } from "@/lib/events/worker-due";
import { isAuthorizedCronRequest, unauthorized } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * Webhook worker: retries due deliveries with exponential backoff, sends scan
 * batches whose window closed, runs data-out syncs, prunes deliveries older
 * than 30 days and deletes expired Better Auth verification values.
 *
 * Callers: .github/workflows/webhook-worker.yml every 5 minutes with
 * ?source=github, and vercel.json once a day. The frequent call first checks
 * the Upstash marker (lib/events/worker-due.ts) and returns
 * `{ skipped: true }` without touching Postgres when nothing is due. The
 * daily call always runs in full. Every full run re-seeds the marker from the
 * database.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return unauthorized();
  const startedAt = Date.now();

  // Local dev and previews share the production database: a run there would
  // only burn real deliveries' attempts ("disabled outside production"), and
  // their checks shouldn't show on production's health page.
  const live = isOutboundDeliveryAllowed();
  const frequent = new URL(request.url).searchParams.get("source") === "github";
  let trigger = "daily";
  if (frequent) {
    const check = await checkWorkerDue(startedAt);
    if (!check.due) {
      if (live) await recordCronCheck("webhooks");
      return Response.json(
        { skipped: true, nextDueAt: new Date(check.nextDueAt).toISOString() },
        { headers: noStore },
      );
    }
    trigger = check.reason;
  }
  if (!live) {
    return Response.json(
      { skipped: true, reason: "delivery_off", trigger },
      { headers: noStore },
    );
  }

  const summary = await runDeliveryWorker({ budgetMs: 40_000 });
  let pruned = 0;
  try {
    pruned = await pruneDeliveries();
  } catch (error) {
    console.error("Pruning webhook deliveries failed:", error);
  }
  // Expired sign-in codes, challenges and passkey options ride along: Better
  // Auth never deletes a value that simply runs out.
  let verificationsPruned = 0;
  try {
    verificationsPruned = await pruneExpiredVerifications();
  } catch (error) {
    console.error("Pruning expired verification values failed:", error);
  }
  // Data-out streams (Google Sheets, HubSpot, Mailchimp) ride the same cron.
  const integrations = await runIntegrationSyncs({ budgetMs: 12_000 });

  // Re-seed while Postgres is awake anyway. On failure the marker keeps what
  // was due, so the next frequent call runs in full again.
  let nextDueAt: number | null = null;
  try {
    const unfinished =
      integrations.streams >
      integrations.ok + integrations.failed + integrations.skipped;
    const times = [
      await nextDeliveryDueAt(),
      await nextIntegrationSyncDueAt(),
      // Out of time before every stream: go on at the next call.
      unfinished ? Date.now() : null,
    ].filter((time): time is number => time !== null);
    nextDueAt = times.length > 0 ? Math.min(...times) : null;
    await reseedWorkerDue(startedAt, nextDueAt);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "cron.webhooks.next_due_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  console.info(
    JSON.stringify({
      event: "cron.webhooks",
      trigger,
      ...summary,
      pruned,
      verificationsPruned,
      integrations,
      nextDueAt: nextDueAt === null ? null : new Date(nextDueAt).toISOString(),
    }),
  );
  await recordCronRun("webhooks", startedAt);
  return Response.json({ ...summary, pruned }, { headers: noStore });
}
