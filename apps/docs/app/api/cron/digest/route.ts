import type { NextRequest } from "next/server";
import { recordCronRun } from "@/lib/cron-runs";
import { DIGEST_SHARDS, runWeeklyDigest } from "@/lib/events/digest";
import { isAuthorizedCronRequest, unauthorized } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby allows up to 60 s; enough for every shard at today's volume.
export const maxDuration = 60;

/**
 * Weekly digest. `?shard=all` (vercel.json, Mondays) runs every shard in turn,
 * which fits Vercel Hobby's once-a-day cron limit; without a param it runs the
 * current UTC hour's shard (for hourly schedules on Pro). `?shard=0-23` reruns
 * one shard by hand; repeats within 24 h are de-duplicated by Resend.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return unauthorized();
  const startedAt = Date.now();

  const param = request.nextUrl.searchParams.get("shard");
  const shard =
    param !== null && /^\d{1,2}$/.test(param) && Number(param) < DIGEST_SHARDS
      ? Number(param)
      : undefined;

  if (param === "all") {
    const shards = [];
    for (let index = 0; index < DIGEST_SHARDS; index++) {
      shards.push(await runWeeklyDigest({ shard: index }));
    }
    console.info(JSON.stringify({ event: "cron.digest", shards }));
    await recordCronRun("digest", startedAt);
    return Response.json(
      { shards },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const summary = await runWeeklyDigest({ shard });
  console.info(JSON.stringify({ event: "cron.digest", ...summary }));
  await recordCronRun("digest", startedAt);
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}
