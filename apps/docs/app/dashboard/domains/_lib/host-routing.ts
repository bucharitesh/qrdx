import { customDomain, database as db } from "@repo/database";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { baseUrl } from "@/lib/metadata";
import { isValidSlug } from "@/lib/short-links";
import {
  CUSTOM_DOMAIN_HEADER,
  isPlatformHostname,
  requestHostname,
} from "./hostname";

// Used by proxy.ts: requests on a customer's domain only ever reach short links
// and the hosted pages they open.

interface CustomHost {
  id: string;
  verified: boolean;
}

/** The only API routes served on custom domains (tagged with the domain id). */
const PAGE_API_PATH =
  /^\/api\/(?:events\/?|(?:forms|vcard|calendar)\/[^/]+\/?)$/;

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1000;
const cache = new Map<string, { host: CustomHost | null; expiresAt: number }>();
const inflight = new Map<string, Promise<CustomHost | null>>();

function remember(hostname: string, host: CustomHost | null) {
  const now = Date.now();
  if (cache.size >= CACHE_MAX_ENTRIES) {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
    // Still full: drop the oldest entry (Map keeps insertion order).
    const oldest = cache.keys().next().value;
    if (cache.size >= CACHE_MAX_ENTRIES && oldest) cache.delete(oldest);
  }
  cache.set(hostname, { host, expiresAt: now + CACHE_TTL_MS });
}

/**
 * The custom_domain row for a host, cached per instance for about a minute
 * (so a newly verified or removed domain takes effect within ~60s).
 */
async function lookupCustomHost(hostname: string): Promise<CustomHost | null> {
  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.host;

  let pending = inflight.get(hostname);
  if (!pending) {
    pending = db
      .select({ id: customDomain.id, verified: customDomain.verified })
      .from(customDomain)
      .where(eq(customDomain.hostname, hostname))
      .limit(1)
      .then(([row]) => {
        const host = row ?? null;
        remember(hostname, host);
        return host;
      })
      .finally(() => inflight.delete(hostname));
    inflight.set(hostname, pending);
  }
  return pending;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] as string,
  );

/** Tiny self-contained page (no scripts, no app assets) for a custom domain. */
function hostPage(status: number, title: string, message: string): Response {
  const origin = baseUrl.origin;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--card:#fff;--border:#e5e5e5}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#fafafa;--muted:#a3a3a3;--card:#171717;--border:#262626}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;width:100%;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:40px 28px}
img{width:40px;height:40px}
h1{font-size:20px;line-height:1.3;margin:20px 0 8px;overflow-wrap:anywhere}
p{margin:0;color:var(--muted);font-size:15px;line-height:1.5}
a{display:inline-block;margin-top:28px;color:var(--fg);font-size:14px;font-weight:600;text-decoration:none;border:1px solid var(--border);border-radius:9999px;padding:8px 16px}
</style>
</head>
<body>
<main>
<img src="${origin}/favicon.svg" alt="QRdx">
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<a href="${origin}/">Make your own QR code with QRdx</a>
</main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": `default-src 'none'; img-src ${origin}; style-src 'unsafe-inline'`,
    },
  });
}

/**
 * Routing for requests on a customer's domain. Returns null for QRdx's own
 * hosts and unknown hosts, which continue through the normal app.
 * Verified domains: `/<slug>` → `/q/<slug>` and `/p/<slug>` → `/p/<slug>`
 * (both tagged with the domain id), `/api/forms/<id>`, `/api/events`,
 * `/api/vcard/<slug>` and `/api/calendar/<slug>` pass through (tagged too),
 * `/` → a small page, everything else 404.
 * Pending domains serve nothing.
 */
export async function routeCustomDomain(
  request: NextRequest,
): Promise<Response | null> {
  const hostname = requestHostname(request.headers.get("host"));
  if (!hostname || isPlatformHostname(hostname)) return null;

  let host: CustomHost | null;
  try {
    host = await lookupCustomHost(hostname);
  } catch (error) {
    console.error("Custom domain lookup failed:", error);
    return null;
  }
  if (!host) return null;

  const { pathname } = request.nextUrl;
  if (!host.verified) {
    return hostPage(
      404,
      "This domain isn't connected yet",
      `${hostname} is still being set up for QR codes.`,
    );
  }
  if (pathname === "/") {
    return hostPage(
      200,
      hostname,
      "This domain hosts QR code links. Scan a QR code to open its page.",
    );
  }

  // Endpoints hosted pages call same-origin (forms, events, vCard, .ics).
  if (PAGE_API_PATH.test(pathname)) {
    const headers = new Headers(request.headers);
    headers.set(CUSTOM_DOMAIN_HEADER, host.id);
    return NextResponse.next({ request: { headers } });
  }

  // `/<slug>` is the short link; `/p/<slug>` the hosted page it redirects to.
  const isPagePath = pathname.startsWith("/p/");
  const slug = pathname.slice(isPagePath ? 3 : 1);
  if (isValidSlug(slug)) {
    const headers = new Headers(request.headers);
    headers.set(CUSTOM_DOMAIN_HEADER, host.id);
    const target = isPagePath ? `/p/${slug}` : `/q/${slug}`;
    return NextResponse.rewrite(new URL(target, request.url), {
      request: { headers },
    });
  }
  return hostPage(
    404,
    "QR code not found",
    "This link doesn't lead to a QR code. Its owner may have removed it, or the link was mistyped.",
  );
}
