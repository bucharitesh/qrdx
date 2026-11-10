import "server-only";

import { abuseReport, database as db, qrCode } from "@repo/database";
import cuid from "cuid";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { after } from "next/server";
import { scheduleWorkerRun } from "@/lib/events/worker-due";
import { mapWithConcurrency, THREAT_LABELS } from "./check";
import { lookupWebRisk } from "./web-risk";

// Destinations created without a Google Web Risk answer: a batch stops
// waiting for Web Risk after its time budget, and Web Risk can be down.
// screenNewCodes (destinations.ts) sets qr_code.web_risk_recheck_at on
// them. They're looked up again right after the response, for as long as
// the request's function may run, and whatever is left by the webhook
// worker (app/api/cron/webhooks, called by GitHub Actions every 5 minutes;
// Vercel Hobby crons run daily only). A destination Web Risk flags is
// handled like a flagged report today (lib/safety/reports.ts): the code is
// switched off and an "auto-threat" report waits in /admin/abuse.

const CONCURRENCY = 16;
/** Codes one pass looks at. */
const PASS_LIMIT = 500;

export interface RecheckSummary {
  checked: number;
  /** Switched off: Web Risk flags the destination */
  flagged: number;
  /** Still to look up (Web Risk didn't answer, out of time, or past the limit) */
  pending: number;
}

function log(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ event, ...fields }));
}

/** Switches a flagged code off and queues it for an admin, as reports do. */
async function switchOff(
  code: { id: string; destinationUrl: string },
  threats: (keyof typeof THREAT_LABELS)[],
) {
  await db.batch([
    db
      .update(qrCode)
      .set({ isActive: false, webRiskRecheckAt: null })
      .where(eq(qrCode.id, code.id)),
    db.insert(abuseReport).values({
      id: cuid(),
      qrCodeId: code.id,
      url: code.destinationUrl.slice(0, 2048),
      reason: "auto-threat",
      details: `Switched off automatically: Google Web Risk flags the destination as ${threats
        .map((threat) => THREAT_LABELS[threat])
        .join(
          " and ",
        )}. It was looked up after the code was created (the check had run out of time or Web Risk was unreachable).`,
      status: "open",
      createdAt: new Date(),
    }),
  ]);
}

/**
 * Looks pending destinations up (these `ids`, else the oldest pending) until
 * `deadline`: flagged ones are switched off, answered ones cleared, the rest
 * stay pending for the next pass.
 */
export async function recheckWebRisk({
  ids,
  deadline,
  limit = PASS_LIMIT,
}: {
  ids?: string[];
  deadline: number;
  limit?: number;
}): Promise<RecheckSummary> {
  const pending = isNotNull(qrCode.webRiskRecheckAt);
  const rows = await db
    .select({ id: qrCode.id, destinationUrl: qrCode.destinationUrl })
    .from(qrCode)
    .where(ids ? and(pending, inArray(qrCode.id, ids)) : pending)
    .orderBy(asc(qrCode.webRiskRecheckAt))
    .limit(limit);

  let flagged = 0;
  const answered: string[] = [];
  const outcomes = await mapWithConcurrency(rows, CONCURRENCY, async (row) => {
    if (Date.now() >= deadline) return "pending";
    const result = await lookupWebRisk(row.destinationUrl);
    if (result.status === "threat") {
      try {
        await switchOff(row, result.threats);
        flagged++;
        return "flagged";
      } catch (error) {
        log("safety.web_risk_recheck.switch_off_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return "pending";
      }
    }
    // Lookups that can't ever answer (no key, a URL Web Risk won't take)
    // are done too; only an outage or the deadline leaves one pending.
    if (result.status === "unknown" && result.reason === "error") {
      return "pending";
    }
    answered.push(row.id);
    return "answered";
  });
  for (let start = 0; start < answered.length; start += 500) {
    await db
      .update(qrCode)
      .set({ webRiskRecheckAt: null })
      .where(inArray(qrCode.id, answered.slice(start, start + 500)));
  }

  const left = outcomes.filter((outcome) => outcome === "pending").length;
  const [more] =
    ids || rows.length < limit
      ? []
      : await db
          .select({ id: qrCode.id })
          .from(qrCode)
          .where(pending)
          .limit(1)
          .offset(limit);
  const summary = {
    checked: answered.length + flagged,
    flagged,
    pending: left + (more ? 1 : 0),
  };
  if (rows.length > 0) log("safety.web_risk_recheck", summary);
  return summary;
}

/**
 * After the response: looks the new codes' pending destinations up while
 * the function may still run (`budgetMs`), then leaves whatever is left to
 * the webhook worker, which is marked due.
 */
export function recheckAfterResponse(ids: string[], budgetMs: number): void {
  if (ids.length === 0) return;
  const task = async () => {
    const deadline = Date.now() + budgetMs;
    try {
      const { pending } = await recheckWebRisk({ ids, deadline });
      if (pending > 0) await scheduleWorkerRun(Date.now());
    } catch (error) {
      log("safety.web_risk_recheck.failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await scheduleWorkerRun(Date.now());
    }
  };
  try {
    after(task);
  } catch {
    // Outside a request (scripts, tests): run now.
    void task();
  }
}
