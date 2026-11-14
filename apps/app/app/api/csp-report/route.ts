import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/request-guards";
import { visitorHash } from "@/lib/scans";
import { parseCspReports } from "@/lib/security/csp-report";

/**
 * Content-Security-Policy violation reports (lib/security/csp.ts `report-uri`
 * and `report-to`), logged as one compact line each so a blocked source shows
 * up in the logs. Only the directive, the blocked origin and the page path are
 * kept: no query strings, no IPs. Rate limited per (hashed) IP.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

const limiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (ip !== "unknown") {
    const key = visitorHash(ip, "csp-report", new Date());
    try {
      if (!(await limiter.limit(`csp:report:${key}`)).success) {
        return new Response(null, { status: 429 });
      }
    } catch {
      // Logging is best effort.
    }
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  for (const violation of parseCspReports(body)) {
    console.warn(`[csp] ${JSON.stringify(violation)}`);
  }
  return new Response(null, { status: 204 });
}
