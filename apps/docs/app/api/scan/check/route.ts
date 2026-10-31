import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { HttpError, handleError } from "@/lib/error-response";
import {
  enforceRateLimits,
  getClientIp,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { mapWithConcurrency } from "@/lib/safety/check";
import {
  isWebRiskConfigured,
  lookupWebRisk,
  type WebRiskResult,
} from "@/lib/safety/web-risk";
import { ValidationError } from "@/types/errors";
import { createQrdxResolver } from "./_lib/qrdx";
import { buildReport } from "./_lib/report";
import { resolveChain } from "./_lib/resolve";
import { fetchBlockReason } from "./_lib/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

// A person scanning by hand never gets near these; they stop the endpoint
// from being used as a free redirect resolver.
const minuteLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });
const dayLimiter = createRateLimiter({ limiter: slidingWindow(300, "1 d") });

const bodySchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

/**
 * Safe-link preview for the /scan page: follows the redirect chain from the
 * server (SSRF-guarded, headers only), checks every hop with Google Web Risk
 * and offline heuristics, and recognizes genuine QRdx codes. Nothing is stored.
 */
export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Cross-site requests are not allowed.",
      );
    }
    const ip = getClientIp(request);
    await enforceRateLimits([
      { limiter: minuteLimiter, key: `scan-check:min:${ip}` },
      { limiter: dayLimiter, key: `scan-check:day:${ip}` },
    ]);

    const { url: input } = parseWithSchema(
      bodySchema,
      await readJsonBody(request, 4096),
    );
    let start: URL;
    try {
      start = new URL(input);
    } catch {
      throw new ValidationError(
        "Enter a full link starting with http:// or https://",
      );
    }
    if (start.protocol !== "http:" && start.protocol !== "https:") {
      throw new ValidationError(
        "Only http:// and https:// links can be checked",
      );
    }

    const qrdx = createQrdxResolver();
    const internal = new Set<string>();
    const chain = await resolveChain(start, {
      resolveInternal: async (url) => {
        const hop = await qrdx.resolveInternal(url);
        if (hop) internal.add(url.toString());
        return hop;
      },
    });

    let webRisk: Map<string, WebRiskResult> | null = null;
    if (isWebRiskConfigured()) {
      const urls = [
        ...new Set(
          chain.hops
            .map((hop) => hop.url)
            // QRdx's own links are checked via the database; local addresses
            // are never sent to Google.
            .filter(
              (url) =>
                !internal.has(url) &&
                /^https?:/i.test(url) &&
                fetchBlockReason(new URL(url)) !== "private-address",
            ),
        ),
      ];
      const results = await mapWithConcurrency(urls, 3, lookupWebRisk);
      webRisk = new Map(
        urls.map((url, index) => [url, results[index] as WebRiskResult]),
      );
    }

    const report = buildReport({
      url: start.toString(),
      chain,
      qrdx: qrdx.getInfo(),
      webRisk,
    });
    return Response.json(report, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    return handleError(error, { route: "/api/scan/check" });
  }
}
