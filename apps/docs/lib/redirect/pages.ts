import { baseUrl } from "@/lib/metadata";
import type { EndedReason } from "./lifecycle";

// Never-Hostage Guarantee: what visitors of an ended or gated code see.
// Deliberately neutral — no QRdx logo or upsell, just the owner's campaign
// status and a small "Report abuse" link.

const ENDED_PAGES: Record<
  EndedReason,
  { status: number; title: string; message: string }
> = {
  "not-started": {
    status: 403,
    title: "This campaign hasn't started yet",
    message: "Please scan this code again later.",
  },
  expired: {
    status: 410,
    title: "This campaign has ended",
    message: "The page behind this QR code is no longer available.",
  },
  "scan-limit": {
    status: 410,
    title: "This campaign has ended",
    message: "The page behind this QR code is no longer available.",
  },
  paused: {
    status: 410,
    title: "This campaign is paused",
    message: "The page behind this QR code isn't available right now.",
  },
};

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] as string,
  );

/** Public report form, prefilled with the code when its slug is known. */
export function reportAbuseUrl(slug?: string): string {
  const url = new URL("/report-abuse", baseUrl);
  if (slug) url.searchParams.set("slug", slug);
  return url.href;
}

const STYLES = `:root{color-scheme:light dark;--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--card:#fff;--border:#e5e5e5;--danger:#dc2626}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#fafafa;--muted:#a3a3a3;--card:#171717;--border:#262626;--danger:#f87171}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;width:100%;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:40px 28px}
h1{font-size:20px;line-height:1.3;margin:0 0 8px}
p{margin:0;color:var(--muted);font-size:15px;line-height:1.5}
form{display:flex;flex-direction:column;gap:12px;margin-top:24px;text-align:left}
label{font-size:14px;font-weight:600}
input{width:100%;font:inherit;font-size:16px;color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px}
input:focus{outline:2px solid var(--fg);outline-offset:1px}
button{font:inherit;font-size:16px;font-weight:600;color:var(--card);background:var(--fg);border:0;border-radius:10px;padding:12px;cursor:pointer}
.error{color:var(--danger);font-size:14px}
footer a{color:var(--muted);font-size:12px}`;

/** Self-contained HTML (no scripts, no external assets). `body` is trusted HTML. */
export function neutralPage({
  status,
  title,
  body,
  slug,
}: {
  status: number;
  title: string;
  body: string;
  slug?: string;
}): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
${STYLES}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
${body}
</main>
<footer><a href="${escapeHtml(reportAbuseUrl(slug))}" rel="nofollow">Report abuse</a></footer>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

/** Status page for an ended code without a fallback URL. */
export function endedPage(reason: EndedReason, slug?: string): Response {
  const { status, title, message } = ENDED_PAGES[reason];
  return neutralPage({
    status,
    title,
    body: `<p>${escapeHtml(message)}</p>`,
    slug,
  });
}
