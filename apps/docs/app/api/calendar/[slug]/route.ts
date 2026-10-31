import { database as db, landingPage, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import { buildIcs, icsFilename } from "@/lib/landing/blocks/event-calendar";
import {
  type EventProps,
  toCalendarEvent,
} from "@/lib/landing/blocks/event-schema";
import { baseUrl } from "@/lib/metadata";
import { checkPageLifecycle } from "@/lib/redirect/lifecycle";
import { getClientIp } from "@/lib/request-guards";
import { isValidSlug } from "@/lib/short-links";

// .ics (RFC 5545) for an event block: /api/calendar/<code slug>?block=<id>.
// Linked from the event block's "Add to calendar" menu (also on custom
// domains). Served only while the page itself may be viewed (lifecycle and
// password unlock cookie), and only for a block id that appears on the page.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

const ipLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

const notFound = () =>
  new Response("Event not found.", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  const blockId = request.nextUrl.searchParams.get("block") ?? "";
  if (!isValidSlug(slug) || !/^[A-Za-z0-9_-]{1,64}$/.test(blockId)) {
    return notFound();
  }

  try {
    const ip = getClientIp(request);
    if (
      ip !== "unknown" &&
      !(await ipLimiter.limit(`calendar:ip:${ip}`)).success
    ) {
      return new Response("Too many requests.", {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }

    const [row] = await db
      .select({
        pageId: landingPage.id,
        content: landingPage.content,
        domainId: qrCode.domainId,
        isActive: qrCode.isActive,
        archivedAt: qrCode.archivedAt,
        deletedAt: qrCode.deletedAt,
        code: {
          id: qrCode.id,
          slug: qrCode.slug,
          passwordHash: qrCode.passwordHash,
          startsAt: qrCode.startsAt,
          expiresAt: qrCode.expiresAt,
          scanLimit: qrCode.scanLimit,
          scanCount: qrCode.scanCount,
          pausedAt: qrCode.pausedAt,
          fallbackUrl: qrCode.fallbackUrl,
        },
      })
      .from(qrCode)
      .innerJoin(landingPage, eq(landingPage.id, qrCode.pageId))
      .where(and(eq(qrCode.slug, slug), eq(qrCode.kind, "page")))
      .limit(1);
    const customDomainId = request.headers.get(CUSTOM_DOMAIN_HEADER);
    if (
      !row ||
      !row.isActive ||
      row.archivedAt ||
      row.deletedAt ||
      (customDomainId && row.domainId !== customDomainId)
    ) {
      return notFound();
    }
    // Same rules as viewing the page: password (unlock cookie), schedule, pause.
    if ((await checkPageLifecycle(row.code)).action !== "allow") {
      return new Response(null, {
        status: 403,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      });
    }

    const parsed = parseLandingPageContent(row.content, { mode: "read" });
    const block = parsed.success
      ? parsed.data.blocks.find(
          (candidate) =>
            candidate.id === blockId &&
            candidate.type === "event" &&
            !candidate.hidden,
        )
      : undefined;
    if (!block) return notFound();

    const props = block.props as EventProps;
    const ics = buildIcs(toCalendarEvent(props), {
      uid: `${block.id}.${row.pageId}@${baseUrl.hostname}`,
    });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${icsFilename(props.title)}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    console.error("Calendar file failed:", error);
    return new Response("Calendar file unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
