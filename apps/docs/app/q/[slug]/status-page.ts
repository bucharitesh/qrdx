import { baseUrl } from "@/lib/metadata";

export type StatusPageKind =
  | "inactive"
  | "not-found"
  | "rate-limited"
  | "unavailable";

const PAGES: Record<
  StatusPageKind,
  { status: number; title: string; message: string }
> = {
  inactive: {
    status: 410,
    title: "This QR code is no longer active",
    message: "This code has been turned off and no longer leads anywhere.",
  },
  "not-found": {
    status: 404,
    title: "QR code not found",
    message:
      "This link doesn't lead to a QR code. Its owner may have removed it, or the link was mistyped.",
  },
  "rate-limited": {
    status: 429,
    title: "Too many requests",
    message:
      "This network opened a lot of QR codes in a short time. Please try again in a few seconds.",
  },
  unavailable: {
    status: 503,
    title: "Something went wrong",
    message:
      "We couldn't open this QR code right now. Please scan it again in a moment.",
  },
};

/** Tiny self-contained HTML page (no scripts) for codes that cannot redirect. */
export function statusPage(kind: StatusPageKind): Response {
  const { status, title, message } = PAGES[kind];
  const origin = baseUrl.origin;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} | QRdx</title>
<style>
:root{color-scheme:light dark;--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--card:#fff;--border:#e5e5e5}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#fafafa;--muted:#a3a3a3;--card:#171717;--border:#262626}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;width:100%;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:40px 28px}
img{width:40px;height:40px}
h1{font-size:20px;line-height:1.3;margin:20px 0 8px}
p{margin:0;color:var(--muted);font-size:15px;line-height:1.5}
a{display:inline-block;margin-top:28px;color:var(--fg);font-size:14px;font-weight:600;text-decoration:none;border:1px solid var(--border);border-radius:9999px;padding:8px 16px}
</style>
</head>
<body>
<main>
<img src="${origin}/favicon.svg" alt="QRdx">
<h1>${title}</h1>
<p>${message}</p>
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
      ...(status === 429 && { "Retry-After": "10" }),
      "Content-Security-Policy": `default-src 'none'; img-src ${origin}; style-src 'unsafe-inline'`,
    },
  });
}
