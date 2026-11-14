import { localizePath } from "@repo/i18n/paths";
import { ENGLISH_SCAN_PAGES, type ScanPagesIntl } from "@/lib/i18n/scan-pages";
import { baseUrl } from "@/lib/metadata";
import { escapeHtml } from "@/lib/redirect/pages";

export type StatusPageKind =
  | "inactive"
  | "not-found"
  | "rate-limited"
  | "unavailable"
  | "invalid-gs1";

/** Each page's HTTP status and its copy in messages/*.json → scanPages.status. */
const PAGES = {
  inactive: { status: 410, key: "inactive" },
  "not-found": { status: 404, key: "notFound" },
  "rate-limited": { status: 429, key: "rateLimited" },
  "invalid-gs1": { status: 400, key: "invalidGs1" },
  unavailable: { status: 503, key: "unavailable" },
} as const satisfies Record<StatusPageKind, { status: number; key: string }>;

/**
 * Tiny self-contained HTML page (no scripts) for codes that cannot redirect,
 * in the scanner's language (lib/i18n/scan-pages.ts). `message` replaces
 * the standard explanation; it's English (the GS1 parser's), so other
 * languages keep their translated one.
 */
export function statusPage(
  kind: StatusPageKind,
  {
    message: detail,
    intl = ENGLISH_SCAN_PAGES,
  }: { message?: string; intl?: ScanPagesIntl } = {},
): Response {
  const { status, key } = PAGES[kind];
  const { t, locale } = intl;
  const title = escapeHtml(t(`status.${key}.title`));
  const message = escapeHtml(
    detail && locale === "en" ? detail : t(`status.${key}.message`),
  );
  const origin = baseUrl.origin;
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(t("status.titleSuffix", { title: t(`status.${key}.title`) }))}</title>
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
<a href="${origin}${localizePath("/", locale)}">${escapeHtml(t("status.makeYourOwn"))}</a>
</main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // The language follows Accept-Language (never cached anyway).
      "Content-Language": locale,
      Vary: "Accept-Language",
      "X-Robots-Tag": "noindex",
      ...(status === 429 && { "Retry-After": "10" }),
      "Content-Security-Policy": `default-src 'none'; img-src ${origin}; style-src 'unsafe-inline'`,
    },
  });
}
