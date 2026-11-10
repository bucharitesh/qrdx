import { database as db, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import { isbot } from "isbot";
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { type RedirectCode, redirectCodeColumns } from "@/lib/redirect/code";
import {
  type RoutingContext,
  resolveDestination,
} from "@/lib/redirect/routing";
import { getClientIp, readJsonBody } from "@/lib/request-guards";
import { normalizeAccuracy, roundedPoint } from "@/lib/scan-location/geo";
import {
  canAskPreciseLocation,
  clearLocationCookie,
  isSecureRequest,
} from "@/lib/scan-location/server";
import { verifyLocationToken } from "@/lib/scan-location/token";
import { attachScanLocation, visitorHash } from "@/lib/scans";

/**
 * POST /api/scan-location: the location a scanner chose to share, from the
 * location step of a redirect code or from a hosted page (lib/scan-location).
 * Same-origin only (custom domains pass it through, host-routing.ts).
 *
 * Body: { token, latitude, longitude, accuracy }. The token (signed, 15
 * minutes) names the scan /q/<slug> just recorded; coordinates are rounded
 * to 3 decimals again here. Stored only when the code still asks and its
 * workspace is on a plan with precise location; anything else is ignored.
 * Answers { url } for redirect codes (routed with the shared location, for
 * geofences; null = keep the destination the step already has) and
 * { ok: true } for hosted pages.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;
/** One attempt to wait for the scan row (recorded after /q's response). */
const RETRY_AFTER_MS = 1500;

const bodySchema = z.object({
  token: z.string().max(200),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullish(),
});

// Per network: generous for a venue full of people behind one IP.
const ipLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });
// Per scan: one answer, plus a retry or two.
const tokenLimiter = createRateLimiter({ limiter: slidingWindow(3, "15 m") });

async function allowed(
  limiter: ReturnType<typeof createRateLimiter>,
  key: string,
): Promise<boolean> {
  try {
    return (await limiter.limit(key)).success;
  } catch {
    return true;
  }
}

function reply(
  status: number,
  body: Record<string, unknown> | null,
  cookie?: string,
): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  if (!body) return new Response(null, { status, headers });
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

const ignored = () => reply(200, { url: null });

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent")?.slice(0, 512) ?? "";
  if (!ua || isbot(ua)) return reply(204, null);

  const now = new Date();
  const ip = getClientIp(request);
  // Raw IPs never reach the limiter: a salted, daily-rotating hash.
  if (
    ip !== "unknown" &&
    !(await allowed(
      ipLimiter,
      `scan-location:ip:${visitorHash(ip, "scan-location", now)}`,
    ))
  ) {
    return reply(429, { url: null });
  }

  let body: z.output<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(
      await readJsonBody(request, MAX_BODY_BYTES),
    );
    if (!parsed.success) return reply(400, { url: null });
    body = parsed.data;
  } catch {
    return reply(400, { url: null });
  }

  const token = verifyLocationToken(body.token, now);
  const point = roundedPoint(body.latitude, body.longitude);
  const accuracyM =
    body.accuracy === null || body.accuracy === undefined
      ? null
      : normalizeAccuracy(body.accuracy);
  const accuracyInvalid =
    body.accuracy !== null && body.accuracy !== undefined && accuracyM === null;
  if (!(token && point) || accuracyInvalid) return reply(400, { url: null });
  if (!(await allowed(tokenLimiter, `scan-location:scan:${token.scanId}`))) {
    return reply(429, { url: null });
  }

  let code: RedirectCode | undefined;
  try {
    [code] = await db
      .select(redirectCodeColumns)
      .from(qrCode)
      .where(eq(qrCode.id, token.codeId))
      .limit(1);
  } catch (error) {
    console.error("Scan location lookup failed:", error);
    return ignored();
  }
  if (!code?.isActive || code.archivedAt || code.deletedAt) return ignored();

  let asks = false;
  try {
    asks = await canAskPreciseLocation(code);
  } catch (error) {
    console.error("Scan location plan check failed:", error);
  }
  // The owner turned it off, or the plan no longer includes it: store nothing.
  if (!asks) return ignored();

  const isPage = code.kind === "page";
  let url: string | null = null;
  const context: RoutingContext = {
    scanId: token.scanId,
    now,
    location: { ...point, source: "gps" },
    // The scan was counted when it was recorded.
    scanNumber: Math.max(1, code.scanCount),
  };
  if (!isPage) {
    try {
      url = await resolveDestination(code, request, context);
    } catch (error) {
      console.error("Scan location routing failed:", error);
    }
  }

  const qrCodeId = code.id;
  const location = { ...point, accuracyM };
  const variant = isPage ? undefined : (context.variant ?? null);
  // After the answer, so the scanner moves on at once. The scan row is
  // written after /q's response; if it isn't there yet, try once more.
  after(async () => {
    try {
      const stored = await attachScanLocation(
        token.scanId,
        qrCodeId,
        location,
        {
          variant,
        },
      );
      if (!stored) {
        await wait(RETRY_AFTER_MS);
        await attachScanLocation(token.scanId, qrCodeId, location, {
          variant,
        });
      }
    } catch (error) {
      console.error("Failed to store scan location:", error);
    }
  });

  return isPage
    ? reply(
        200,
        { ok: true },
        clearLocationCookie(code.slug, { secure: isSecureRequest(request) }),
      )
    : reply(200, { url });
}
