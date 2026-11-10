import { purgeAuditEvents } from "@/ee/audit-log/retention";
import {
  completeDueTwoFactorResets,
  type DueResetsSummary,
} from "@/lib/account/two-factor-reset-server";
import { releaseHeldCommissions } from "@/lib/affiliates/commissions";
import {
  pruneExpiredVerifications,
  pruneStaleKnownDevices,
} from "@/lib/auth/verification-prune";
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
import { type RecheckSummary, recheckWebRisk } from "@/lib/safety/recheck";
import { isAuthorizedCronRequest, unauthorized } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * Webhook worker: retries due deliveries with exponential backoff, sends scan
 * batches whose window closed, runs data-out syncs, looks up destinations
 * created without a Web Risk answer, prunes deliveries older
 * than 30 days and deletes expired Better Auth verification values. The daily
 * call also forgets browsers no account has seen for 400 days and completes
 * support's turn-offs of two-step verification that are due.
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
  // Browsers kept for new sign-in alerts: once a day is plenty for a
  // 400-day limit.
  let knownDevicesPruned = 0;
  // Support's turn-offs of two-step verification that have waited their 7
  // days (lib/account/two-factor-reset-server.ts): due from the start of a
  // UTC day, so the daily run is the one that completes them.
  let twoFactorResets: DueResetsSummary | null = null;
  if (trigger === "daily") {
    try {
      knownDevicesPruned = await pruneStaleKnownDevices();
    } catch (error) {
      console.error("Pruning stale known devices failed:", error);
    }
    try {
      twoFactorResets = await completeDueTwoFactorResets();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "cron.webhooks.two_factor_resets_failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  // Workspace audit log rows past 365 days (ee/audit-log/retention.ts): at
  // most 5 s, ending by 45 s so the syncs' 12 s fit in maxDuration; the
  // rest goes in the next daily run.
  const auditEventsPurged =
    trigger === "daily"
      ? await purgeAuditEvents({
          deadline: Math.min(Date.now() + 5_000, startedAt + 45_000),
        })
      : 0;
  // Affiliate commissions whose 30-day hold is over become "approved"
  // (lib/affiliates/commissions.ts): at most 3 s, also ending by 45 s so
  // the syncs still fit. Pages already treat them as payable, so whatever
  // is left can wait a day.
  const commissionsReleased =
    trigger === "daily"
      ? await releaseHeldCommissions({
          deadline: Math.min(Date.now() + 3_000, startedAt + 45_000),
        })
      : 0;
  // Data-out streams (Google Sheets, HubSpot, Mailchimp) ride the same cron.
  const integrations = await runIntegrationSyncs({ budgetMs: 12_000 });
  // Destinations created without a Web Risk answer (large batches out of
  // time, Web Risk down): look them up, switch off the flagged ones
  // (lib/safety/recheck.ts). At most 8 s, ending by 50 s.
  let webRisk: RecheckSummary | null = null;
  try {
    webRisk = await recheckWebRisk({
      deadline: Math.min(Date.now() + 8_000, startedAt + 50_000),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "cron.webhooks.web_risk_recheck_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

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
      // Web Risk re-checks left (or the step failed): the next call too.
      webRisk === null || webRisk.pending > 0 ? Date.now() : null,
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
      knownDevicesPruned,
      twoFactorResets,
      auditEventsPurged,
      commissionsReleased,
      integrations,
      webRisk,
      nextDueAt: nextDueAt === null ? null : new Date(nextDueAt).toISOString(),
    }),
  );
  await recordCronRun("webhooks", startedAt);
  return Response.json({ ...summary, pruned }, { headers: noStore });
}
