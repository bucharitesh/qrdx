import { database as db, landingPage, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, asc, eq, isNull } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { CUSTOM_DOMAIN_HEADER } from "@/app/(app)/dashboard/domains/_lib/hostname";
// NFC taps: `?nfc` on the short link marks the scan as a tap (lib/nfc/links.ts).
import { scanSourceOf } from "@/lib/nfc/links";
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
import {
  asksPreciseLocation,
  canAskPreciseLocation,
  isSecureRequest,
  locationCookie,
} from "@/lib/scan-location/server";
import { locationStepPage } from "@/lib/scan-location/step-page";
import { signLocationToken } from "@/lib/scan-location/token";
import { createScanId, isRecordableVisit, recordScan } from "@/lib/scans";
import { isValidSlug } from "@/lib/short-links";
import { slugWhere } from "@/lib/slug-claims";
import { statusPage } from "./status-page";

// The redirect pipeline behind /q/<slug> (route.ts) and, on custom domains,
// GS1 Digital Links (app/gs1/[...path]/route.ts): lookup → on/off checks →
// lifecycle → page or routing. Both record scans the same way.

/** Which code to open: a short link's slug, or a product page's GTIN on a custom domain. */
export type ShortLinkLookup =
  | { slug: string }
  | { gtin: string; domainId: string };

/**
 * The code a GS1 Digital Link opens on a custom domain: a page code of a
 * product page with that GTIN on that domain. Publishing keeps a GTIN to
 * one page per domain; if two codes still match (a page with two codes),
 * an active one wins, then the oldest.
 */
async function findGtinCode(
  gtin: string,
  domainId: string,
): Promise<RedirectCode | null> {
  const rows = await db
    .select(redirectCodeColumns)
    .from(qrCode)
    .innerJoin(landingPage, eq(landingPage.id, qrCode.pageId))
    .where(
      and(
        eq(qrCode.domainId, domainId),
        eq(qrCode.kind, "page"),
        eq(landingPage.gtin, gtin),
        isNull(qrCode.deletedAt),
      ),
    )
    .orderBy(asc(qrCode.createdAt))
    .limit(10);
  return rows.find((row) => row.isActive && !row.archivedAt) ?? rows[0] ?? null;
}

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
export async function resolveShortLink(
  request: NextRequest,
  lookup: ShortLinkLookup,
  { record }: { record: boolean },
): Promise<Response> {
  if ("slug" in lookup && !isValidSlug(lookup.slug)) {
    return statusPage("not-found");
  }
  // The limiter runs alongside the lookup so scans don't wait on it.
  const limited = isRateLimited(request);
  // On a custom domain (set by proxy.ts) only that domain's codes resolve; the
  // default host resolves every shared-namespace slug (generated ones and
  // back-halves chosen on it), so links printed before a move keep working.
  // One indexed lookup either way.
  const customDomainId = request.headers.get(CUSTOM_DOMAIN_HEADER);
  let code: RedirectCode | null;
  try {
    if ("slug" in lookup) {
      [code = null] = await db
        .select(redirectCodeColumns)
        .from(qrCode)
        .where(slugWhere(lookup.slug, customDomainId))
        .limit(1);
    } else {
      code = await findGtinCode(lookup.gtin, lookup.domainId);
    }
  } catch (error) {
    console.error("Short link lookup failed:", error);
    return statusPage("unavailable");
  }

  if (await limited) {
    return statusPage("rate-limited");
  }
  if (!code) {
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
  // Precise location (lib/scan-location/server.ts): only codes whose owner
  // turned it on look any further (plan check, step page, cookie); every
  // other scan goes on exactly as before.
  const askLocation =
    record &&
    lifecycle.action === "allow" &&
    asksPreciseLocation(code.pixels) &&
    isRecordableVisit(request.headers) &&
    (await canAskPreciseLocation(code).catch((error) => {
      console.error("Precise location check failed:", error);
      return false;
    }));
  if (record) {
    const qrCodeId = code.id;
    // Runs after the response is sent, so scanning never waits on analytics.
    after(() =>
      recordScan(qrCodeId, request, {
        scanId,
        now,
        variant: routingContext.variant,
        source: scanSourceOf(request.nextUrl),
        locationAsked: askLocation,
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
    const response = redirect(`/p/${encodeURIComponent(code.slug)}`, status);
    if (askLocation) {
      // The hosted page asks in-page and posts the answer with this token.
      response.headers.append(
        "Set-Cookie",
        locationCookie(signLocationToken(scanId, code.id, now), code.slug, {
          secure: isSecureRequest(request),
        }),
      );
    }
    return response;
  }

  let destination = code.destinationUrl;
  try {
    destination = await resolveDestination(code, request, routingContext);
  } catch (error) {
    // Fail open: a broken rule must never stop a code from redirecting.
    console.error("Short link routing failed:", error);
  }
  if (askLocation) {
    try {
      // "Share your location?", then the destination (Skip goes straight there).
      return locationStepPage({
        token: signLocationToken(scanId, code.id, now),
        next: destination,
        slug: code.slug,
      });
    } catch (error) {
      console.error("Location step failed:", error);
    }
  }
  return redirect(destination, status);
}
