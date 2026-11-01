import "server-only";

import { redis } from "@repo/rate-limit";

/**
 * Last run of each cron job, kept in Upstash for the admin health page
 * (/admin/health). Best effort: without Redis nothing is recorded, and a
 * failed write never fails the job.
 */

export const CRON_JOBS = ["webhooks", "integrations", "digest"] as const;
export type CronJob = (typeof CRON_JOBS)[number];

export interface CronRun {
  at: string;
  ok: boolean;
  durationMs: number;
}

const key = (job: CronJob) => `qrdx:cron:last-run:${job}`;
// A job that stopped running shouldn't look fresh forever.
const TTL_SECONDS = 30 * 24 * 60 * 60;

export async function recordCronRun(
  job: CronJob,
  startedAt: number,
  ok = true,
): Promise<void> {
  if (!redis) return;
  const run: CronRun = {
    at: new Date().toISOString(),
    ok,
    durationMs: Date.now() - startedAt,
  };
  try {
    await redis.set(key(job), JSON.stringify(run), { ex: TTL_SECONDS });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "cron.record_failed",
        job,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export async function getCronRuns(): Promise<Record<CronJob, CronRun | null>> {
  const empty = Object.fromEntries(
    CRON_JOBS.map((job) => [job, null]),
  ) as Record<CronJob, CronRun | null>;
  if (!redis) return empty;
  const values = await redis.mget<(CronRun | string | null)[]>(
    ...CRON_JOBS.map(key),
  );
  for (const [index, job] of CRON_JOBS.entries()) {
    const value = values[index];
    // Upstash parses JSON values itself; older clients return the string.
    const run =
      typeof value === "string" ? (JSON.parse(value) as CronRun) : value;
    empty[job] = run && typeof run.at === "string" ? run : null;
  }
  return empty;
}
