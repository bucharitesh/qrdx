import { loadOgFonts, ogSize } from "@repo/design-system/og/brand";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { displayUrl } from "@/app/(app)/dashboard/codes/_components/format";
import {
  CUSTOM_DOMAIN_HEADER,
  isCustomDomainRequest,
} from "@/app/(app)/dashboard/domains/_lib/hostname";
import { accentUse } from "@/lib/client-brands-shared";
import { loadPublicStats } from "@/lib/public-stats";
import { DEFAULT_PUBLIC_STATS_RANGE } from "@/lib/public-stats-shared";
import { getClientIp } from "@/lib/request-guards";

// The link preview of a client-branded stats page (agency tools): the
// client's name and the code's, in the page's monochrome look with the
// client's color as one rule. No numbers, and no logo: the server never
// fetches a logo URL someone typed. Plain pages have no preview image.

const limiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const limited = await limiter
    .limit(`public-stats:og:${getClientIp(request)}`)
    .then((result) => !result.success)
    .catch(() => false);
  if (limited) return new Response("Too many requests", { status: 429 });

  const customDomainId = isCustomDomainRequest(request.headers)
    ? request.headers.get(CUSTOM_DOMAIN_HEADER)
    : null;
  const stats = await loadPublicStats(token, DEFAULT_PUBLIC_STATS_RANGE, {
    customDomainId,
  });
  if (!stats?.brand) return new Response("Not found", { status: 404 });

  const { brand } = stats;
  const name = stats.code.title?.trim() || displayUrl(stats.code.shortLink);
  const accent = brand.accent ?? "#0a0a0a";
  const onAccent = brand.accent ? accentUse(brand.accent).onAccent : "#ffffff";
  const fonts = await loadOgFonts();

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        fontFamily: fonts ? "Geist" : undefined,
        color: "#0A0A0A",
        backgroundColor: "#FDFDFD",
        borderTop: `10px solid ${accent}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 72,
            height: 72,
            borderRadius: 18,
            backgroundColor: accent,
            color: onAccent,
            fontSize: 38,
            fontWeight: 600,
          }}
        >
          {(brand.name.trim().charAt(0) || "C").toUpperCase()}
        </div>
        <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>
          {truncate(brand.name, 40)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 30, color: "#525252" }}>Scan report</div>
        <div
          style={{
            fontSize: name.length > 40 ? 60 : 76,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: -2.5,
          }}
        >
          {truncate(name, 80)}
        </div>
      </div>

      <div style={{ display: "flex", fontSize: 24, color: "#737373" }}>
        {stats.hideQrdx
          ? "Scans over time, places and devices"
          : "Made with QRdx"}
      </div>
    </div>,
    {
      ...ogSize,
      fonts,
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
