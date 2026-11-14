import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { applyUnsubscribe } from "@/lib/events/notification-settings";
import { EVENT_INFO } from "@/lib/events/types";
import {
  type UnsubscribeScope,
  verifyUnsubscribeToken,
} from "@/lib/events/unsubscribe";
import { getClientIp } from "@/lib/request-guards";

// Unsubscribe links in alert and digest emails. GET shows a confirmation
// button (link scanners must not unsubscribe anyone); POST applies it, which
// also serves RFC 8058 one-click requests from mail clients. No sign-in.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const describe = (event: UnsubscribeScope) =>
  event === "all"
    ? "all QRdx alert and digest emails"
    : `${EVENT_INFO[event].label.toLowerCase()} emails`;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · QRdx</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: Canvas; color: CanvasText; }
  main { max-width: 28rem; margin: 12vh auto; padding: 0 1.25rem; }
  h1 { font-size: 1.375rem; margin: 0 0 .75rem; }
  p { line-height: 1.55; opacity: .85; }
  button, a.button { display: inline-block; margin-top: .75rem; padding: .7rem 1.2rem; border: 0; border-radius: 999px; background: #155DFC; color: #fff; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
  a { color: #155DFC; }
  .logo { font-weight: 700; font-size: 1.25rem; letter-spacing: -.02em; text-decoration: none; color: inherit; display: inline-block; margin-bottom: 2rem; }
  .logo span { color: #155DFC; }
</style>
</head>
<body><main><a class="logo" href="/">QR<span>dx</span></a>${body}</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const invalid = () =>
  page(
    "Link not valid",
    `<h1>This unsubscribe link isn't valid</h1>
<p>It may have been cut off by your email app. You can turn emails off any time in <a href="/settings/notifications">notification settings</a>.</p>`,
    400,
  );

async function limited(request: NextRequest): Promise<boolean> {
  try {
    return !(await limiter.limit(`unsubscribe:${getClientIp(request)}`))
      .success;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return invalid();
  return page(
    "Unsubscribe",
    `<h1>Unsubscribe from ${escapeHtml(describe(parsed.event))}?</h1>
<p>You can turn them back on in notification settings.</p>
<form method="post" action="?token=${encodeURIComponent(token)}">
  <button type="submit">Unsubscribe</button>
</form>`,
  );
}

export async function POST(request: NextRequest) {
  if (await limited(request)) {
    return page(
      "Too many requests",
      "<h1>Too many requests</h1><p>Please try again in a minute.</p>",
      429,
    );
  }
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return invalid();

  try {
    await applyUnsubscribe(parsed.settingId, parsed.event);
  } catch (error) {
    console.error("Unsubscribe failed:", error);
    return page(
      "Something went wrong",
      `<h1>Something went wrong</h1><p>Please try again, or turn emails off in <a href="/settings/notifications">notification settings</a>.</p>`,
      500,
    );
  }
  // Already removed counts as done: the link may be used twice.
  return page(
    "Unsubscribed",
    `<h1>You're unsubscribed</h1>
<p>You won't get ${escapeHtml(describe(parsed.event))} anymore.</p>
<a class="button" href="/settings/notifications">Notification settings</a>`,
  );
}
