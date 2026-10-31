import "server-only";

import { database as db, fileAsset } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import {
  isStorageConfigured,
  presignDownload,
  publicUrl,
} from "@/lib/storage/r2";
import { FILE_ID_PATTERN } from "./types";

/**
 * Public delivery of uploaded files: `/api/files/<id>` redirects to the
 * object (public bucket URL, else a presigned GET), so the link never
 * changes when a file is replaced and stops working as soon as a file is
 * blocked or deleted. Unavailable files answer in a form the requesting
 * element can show: an image placeholder for <img>, a small page for
 * iframes and tabs, a plain error otherwise (media players show their own).
 */

const ipLimiter = createRateLimiter({ limiter: slidingWindow(600, "60 s") });

// Short, so a replaced or blocked file takes effect within a minute.
const REDIRECT_CACHE = "public, max-age=60, s-maxage=60";
const DOWNLOAD_CACHE = "private, max-age=60";
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

const COMMON_HEADERS = {
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

type Destination = "image" | "document" | "other";

function destinationOf(req: Request): Destination {
  const dest = req.headers.get("sec-fetch-dest");
  if (dest === "image") return "image";
  if (
    dest === "document" ||
    dest === "iframe" ||
    dest === "embed" ||
    dest === "object" ||
    dest === "frame"
  ) {
    return "document";
  }
  if (dest) return "other";
  // Browsers without Fetch Metadata: fall back to Accept.
  const accept = req.headers.get("accept") ?? "";
  if (accept.startsWith("image/")) return "image";
  return accept.includes("text/html") ? "document" : "other";
}

const UNAVAILABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="File unavailable"><rect width="640" height="480" fill="#f4f4f5"/><g fill="none" stroke="#a1a1aa" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" transform="translate(272 172)"><rect x="6" y="6" width="84" height="84" rx="12"/><path d="M6 66l24-24 24 24 12-12 24 24"/><path d="M6 6l84 84"/></g><text x="320" y="320" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="28" fill="#71717a">File unavailable</text></svg>`;

function unavailablePage(status: number): string {
  const message =
    status === 503
      ? "Files can't be served right now. Please try again later."
      : "This file is no longer available. It may have been removed by its owner.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>File unavailable</title>
<style>
:root{color-scheme:light dark;--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--card:#fff;--border:#e5e5e5}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#fafafa;--muted:#a3a3a3;--card:#171717;--border:#262626}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;width:100%;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:32px 24px}
h1{font-size:18px;line-height:1.3;margin:0 0 8px}
p{margin:0;color:var(--muted);font-size:15px;line-height:1.5}
</style>
</head>
<body>
<main>
<h1>File unavailable</h1>
<p>${message}</p>
</main>
</body>
</html>`;
}

function unavailable(req: Request, status: 404 | 410 | 503): Response {
  const headers = { ...COMMON_HEADERS, "Cache-Control": "no-store" };
  switch (destinationOf(req)) {
    case "image":
      // 200 so every browser paints the placeholder inside the <img>.
      return new Response(UNAVAILABLE_SVG, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "image/svg+xml",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    case "document":
      return new Response(unavailablePage(status), {
        status,
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    default:
      return new Response("File unavailable", {
        status,
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
      });
  }
}

export async function deliverFile(
  req: Request,
  id: string,
  { download = false }: { download?: boolean } = {},
): Promise<Response> {
  if (!FILE_ID_PATTERN.test(id)) return unavailable(req, 404);

  try {
    await enforceRateLimits([
      { limiter: ipLimiter, key: `files:get:ip:${getClientIp(req)}` },
    ]);
  } catch (error) {
    if (error instanceof HttpError) {
      return new Response("Too many requests", {
        status: error.status,
        headers: { ...error.headers, "Cache-Control": "no-store" },
      });
    }
    throw error;
  }

  if (!isStorageConfigured) return unavailable(req, 503);

  const [row] = await db
    .select({
      status: fileAsset.status,
      storageKey: fileAsset.storageKey,
      filename: fileAsset.filename,
    })
    .from(fileAsset)
    .where(eq(fileAsset.id, id))
    .limit(1);
  if (!row || row.status === "pending") return unavailable(req, 404);
  if (row.status !== "ready") return unavailable(req, 410);

  if (download) {
    const location = await presignDownload(row.storageKey, {
      filename: row.filename,
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
    return new Response(null, {
      status: 302,
      headers: {
        ...COMMON_HEADERS,
        Location: location,
        "Cache-Control": DOWNLOAD_CACHE,
      },
    });
  }

  const location =
    publicUrl(row.storageKey) ?? (await presignDownload(row.storageKey));
  return new Response(null, {
    status: 302,
    headers: {
      ...COMMON_HEADERS,
      Location: location,
      "Cache-Control": REDIRECT_CACHE,
    },
  });
}
