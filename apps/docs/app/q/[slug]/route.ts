import { database as db, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { getClientIp } from "@/lib/request-guards";
import { recordScan } from "@/lib/scans";
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
  let code: Pick<
    typeof qrCode.$inferSelect,
    "id" | "destinationUrl" | "isActive" | "archivedAt" | "domainId"
  > | null;
  try {
    [code = null] = await db
      .select({
        id: qrCode.id,
        destinationUrl: qrCode.destinationUrl,
        isActive: qrCode.isActive,
        archivedAt: qrCode.archivedAt,
        domainId: qrCode.domainId,
      })
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
  // Only the owner archiving or an admin disabling turns a code off; plan changes never do.
  if (!code.isActive || code.archivedAt) {
    return statusPage("inactive");
  }

  if (record) {
    const qrCodeId = code.id;
    // Runs after the redirect is sent, so scanning never waits on analytics.
    after(() =>
      recordScan(qrCodeId, request).catch((error) => {
        console.error("Failed to record scan:", error);
      }),
    );
  }

  // 302, never 301: destinations change and browsers cache permanent redirects.
  return new Response(null, {
    status: 302,
    headers: {
      Location: code.destinationUrl,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, slug, { record: true });
}

export async function HEAD(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, slug, { record: false });
}
