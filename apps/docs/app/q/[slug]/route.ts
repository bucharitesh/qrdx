import { database as db, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { type RedirectCode, redirectCodeColumns } from "@/lib/redirect/code";
import {
  evaluateLifecycle,
  gateResponse,
  type LifecycleResult,
} from "@/lib/redirect/lifecycle";
import { endedPage } from "@/lib/redirect/pages";
import {
  type RoutingContext,
  resolveDestination,
} from "@/lib/redirect/routing";
import { getClientIp } from "@/lib/request-guards";
import { createScanId, recordScan } from "@/lib/scans";
import { isValidSlug } from "@/lib/short-links";
import { statusPage } from "./status-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

// Generous enough for a venue full of people behind one IP; stops slug enumeration.
const ipLimiter = createRateLimiter({ limiter: slidingWindow(120, "10 s") });

async function isRateLimited(request: NextRequest): Promise<boolean> {
  const ip = getClientIp(request);
  if (ip === "unknown") return false;
  try {
    return !(await ipLimiter.limit(`q:ip:${ip}`)).success;
  } catch {
    // Never block scans because the limiter is down.
    return false;
  }
}

// Never 301: destinations change and browsers cache permanent redirects.
// 303 after a POST (gate form) so the browser follows with a GET.
function redirect(location: string, status: 302 | 303): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

/**
 * The redirect pipeline: lookup → on/off checks → lifecycle
 * (lib/redirect/lifecycle.ts) → page or routing (lib/redirect/routing.ts).
 */
async function resolveShortLink(
  request: NextRequest,
  slug: string,
  { record }: { record: boolean },
): Promise<Response> {
  if (!isValidSlug(slug)) {
    return statusPage("not-found");
  }
  // The limiter runs alongside the lookup so scans don't wait on it.
  const limited = isRateLimited(request);
  let code: RedirectCode | null;
  try {
    [code = null] = await db
      .select(redirectCodeColumns)
      .from(qrCode)
      .where(eq(qrCode.slug, slug))
      .limit(1);
  } catch (error) {
    console.error("Short link lookup failed:", error);
    return statusPage("unavailable");
  }

  if (await limited) {
    return statusPage("rate-limited");
  }
  // On a custom domain (set by proxy.ts) only that domain's codes resolve; the
  // default host resolves every code, so links printed before a move keep working.
  const customDomainId = request.headers.get(CUSTOM_DOMAIN_HEADER);
  if (!code || (customDomainId && code.domainId !== customDomainId)) {
    return statusPage("not-found");
  }
  // Only the owner archiving or trashing, or an admin disabling, turns a code
  // off; plan changes never do.
  if (!code.isActive || code.archivedAt || code.deletedAt) {
    return statusPage("inactive");
  }

  let lifecycle: LifecycleResult;
  try {
    lifecycle = await evaluateLifecycle(code, request);
  } catch (error) {
    // Fail closed: a broken check must not skip a password gate.
    console.error("Short link lifecycle check failed:", error);
    return statusPage("unavailable");
  }

  const now = new Date();
  const scanId = createScanId();
  // resolveDestination sets `variant`; the scan is recorded after the response.
  const routingContext: RoutingContext = { scanId, now };
  if (record) {
    const qrCodeId = code.id;
    // Runs after the response is sent, so scanning never waits on analytics.
    after(() =>
      recordScan(qrCodeId, request, {
        scanId,
        now,
        variant: routingContext.variant,
      }).catch((error) => {
        console.error("Failed to record scan:", error);
      }),
    );
  }

  if (lifecycle.action === "gate") {
    try {
      return await gateResponse(code, request, lifecycle.reason);
    } catch (error) {
      console.error("Short link gate failed:", error);
      return statusPage("unavailable");
    }
  }

  const status = request.method === "POST" ? 303 : 302;
  if (lifecycle.action === "ended") {
    return lifecycle.fallbackUrl
      ? redirect(lifecycle.fallbackUrl, status)
      : endedPage(lifecycle.reason, code.slug);
  }

  if (code.kind === "page") {
    // Relative, so the visitor stays on the host they scanned (custom domains too).
    return redirect(`/p/${encodeURIComponent(code.slug)}`, status);
  }

  let destination = code.destinationUrl;
  try {
    destination = await resolveDestination(code, request, routingContext);
  } catch (error) {
    // Fail open: a broken rule must never stop a code from redirecting.
    console.error("Short link routing failed:", error);
  }
  return redirect(destination, status);
}

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, slug, { record: true });
}

export async function HEAD(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, slug, { record: false });
}

/** Gate form submissions (password); the GET that showed the gate already counted the scan. */
export async function POST(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, slug, { record: false });
}
