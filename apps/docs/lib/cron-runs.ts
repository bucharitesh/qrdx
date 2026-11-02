import "server-only";

import { redis } from "@repo/rate-limit";

/**
 * Last run of each cron job, kept in Upstash for the admin health page
 * (/admin/health). A frequent call that found nothing due (the webhook
 * worker's ?source=github check) is a check, not a run, and is kept apart.
 * Best effort: without Redis nothing is recorded, and a failed write never
 * fails the job.
 */

export const CRON_JOBS = ["webhooks", "integrations", "digest"] as const;
export type CronJob = (typeof CRON_JOBS)[number];

export interface CronRun {
  at: string;
  ok: boolean;
  durationMs: number;
}

export interface CronStatus {
  run: CronRun | null;
  /** Last check that found nothing due (ISO time) */
  lastCheckAt: string | null;
}

const key = (job: CronJob) => `qrdx:cron:last-run:${job}`;
const checkKey = (job: CronJob) => `qrdx:cron:last-check:${job}`;
// A job that stopped running shouldn't look fresh forever.
const TTL_SECONDS = 30 * 24 * 60 * 60;

async function write(job: CronJob, name: string, value: string) {
  if (!redis) return;
  try {
    await redis.set(name, value, { ex: TTL_SECONDS });
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

export function recordCronRun(
  job: CronJob,
  startedAt: number,
  ok = true,
): Promise<void> {
  const run: CronRun = {
    at: new Date().toISOString(),
    ok,
    durationMs: Date.now() - startedAt,
  };
  return write(job, key(job), JSON.stringify(run));
}

/** A call that checked and found nothing due: not recorded as a run. */
export function recordCronCheck(job: CronJob): Promise<void> {
  return write(job, checkKey(job), new Date().toISOString());
}

export async function getCronRuns(): Promise<Record<CronJob, CronStatus>> {
  const status = Object.fromEntries(
    CRON_JOBS.map((job) => [job, { run: null, lastCheckAt: null }]),
  ) as Record<CronJob, CronStatus>;
  if (!redis) return status;
  const values = await redis.mget<(CronRun | string | null)[]>(
    ...CRON_JOBS.map(key),
    ...CRON_JOBS.map(checkKey),
  );
  for (const [index, job] of CRON_JOBS.entries()) {
    const value = values[index];
    // Upstash parses JSON values itself; older clients return the string.
    const run =
      typeof value === "string" ? (JSON.parse(value) as CronRun) : value;
    const check = values[CRON_JOBS.length + index];
    status[job] = {
      run: run && typeof run.at === "string" ? run : null,
      lastCheckAt: typeof check === "string" ? check : null,
    };
  }
  return status;
}
