import "server-only";

import { redis } from "@repo/rate-limit";

// When is the webhook worker (/api/cron/webhooks) next needed? GitHub Actions
// calls it every few minutes with ?source=github. Those calls check this
// Upstash marker first and return without touching Postgres while nothing is
// due, so Neon can scale to zero between real work.
//
// The marker is one sorted set, scored by epoch ms:
// - "m:<minute>": work scheduled for that minute (a delivery retry, a scan
//   batch closing, a data-sync retry), added by whoever scheduled it. Times are
//   rounded up to the minute, so a burst adds one member.
// - "db": the earliest due time in the database at the last full run.
// - "seeded": a full run has seeded the set. Its score forces a full run a day
//   after the last one even when nothing is scheduled.
// A full run removes the members due by the time it started (it handled them)
// and writes "db" and "seeded" again. Members scheduled while it ran survive,
// so scheduling never races a run. No Redis, no "seeded" (never seeded,
// expired) or a Redis error means a full run: safe by default. Work nobody
// could mark (a function killed mid-send) is found by the daily Vercel cron,
// which always runs in full and re-seeds.

export const WORKER_DUE_KEY = "qrdx:cron:webhooks:due";
const SEEDED = "seeded";
const FROM_DB = "db";
const MINUTE_MS = 60_000;
/** A full run at least this often, even when nothing is scheduled. */
const RESEED_AFTER_MS = 24 * 60 * MINUTE_MS;
/** Cleanup only: every full run refreshes it. */
const TTL_SECONDS = 3 * 24 * 60 * 60;

function log(event: string, error: unknown) {
  console.error(
    JSON.stringify({
      event,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

/**
 * Minutes this instance already added. A removed member is never needed
 * again (runs only remove past minutes; new work is never in the past), so a
 * burst of scans or retries costs one Redis call.
 */
const scheduledMinutes = new Set<number>();

export function forgetScheduledRunsForTests() {
  scheduledMinutes.clear();
}

/**
 * Work becomes due at `at` (a past time means now). Never throws: without the
 * mark the work still goes out at the next full run.
 */
export async function scheduleWorkerRun(at: Date | number): Promise<void> {
  if (!redis) return;
  const time = typeof at === "number" ? at : at.getTime();
  if (!Number.isFinite(time)) return;
  const minute = Math.ceil(Math.max(time, Date.now()) / MINUTE_MS);
  if (scheduledMinutes.has(minute)) return;
  try {
    await redis.zadd(WORKER_DUE_KEY, {
      score: minute * MINUTE_MS,
      member: `m:${minute}`,
    });
    if (scheduledMinutes.size >= 1000) scheduledMinutes.clear();
    scheduledMinutes.add(minute);
  } catch (error) {
    log("cron.webhooks.schedule_failed", error);
  }
}

export type WorkerDue =
  | { due: false; nextDueAt: number }
  | {
      due: true;
      reason: "scheduled" | "unseeded" | "no-redis" | "redis-error";
    };

/** For the frequent caller: does this call need a full run? */
export async function checkWorkerDue(
  now: number = Date.now(),
): Promise<WorkerDue> {
  if (!redis) return { due: true, reason: "no-redis" };
  try {
    const [seeded, first] = (await redis
      .pipeline()
      .zscore(WORKER_DUE_KEY, SEEDED)
      .zrange(WORKER_DUE_KEY, 0, 0, { withScores: true })
      .exec()) as [unknown, unknown[] | null];
    if (seeded === null || seeded === undefined) {
      return { due: true, reason: "unseeded" };
    }
    // [member, score] of the earliest member; seeded guarantees one exists.
    const nextDueAt = Number(first?.[1]);
    if (!Number.isFinite(nextDueAt)) return { due: true, reason: "unseeded" };
    return nextDueAt <= now
      ? { due: true, reason: "scheduled" }
      : { due: false, nextDueAt };
  } catch (error) {
    log("cron.webhooks.check_failed", error);
    return { due: true, reason: "redis-error" };
  }
}

/**
 * After a full run that started at `runStartedAt`: drop what it handled and
 * store the database's earliest due time (null: nothing scheduled).
 */
export async function reseedWorkerDue(
  runStartedAt: number,
  nextDueAt: number | null,
): Promise<void> {
  if (!redis) return;
  try {
    // One transaction: a reader never sees the set half-updated.
    const tx = redis.multi();
    tx.zremrangebyscore(WORKER_DUE_KEY, "-inf", runStartedAt);
    tx.zadd(
      WORKER_DUE_KEY,
      { score: runStartedAt + RESEED_AFTER_MS, member: SEEDED },
      ...(nextDueAt === null ? [] : [{ score: nextDueAt, member: FROM_DB }]),
    );
    if (nextDueAt === null) tx.zrem(WORKER_DUE_KEY, FROM_DB);
    tx.expire(WORKER_DUE_KEY, TTL_SECONDS);
    await tx.exec();
  } catch (error) {
    log("cron.webhooks.reseed_failed", error);
  }
}
