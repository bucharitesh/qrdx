import { docsManifest } from "@/lib/zone-manifest";

// The docs' sitemap entries and sections, for the main app's /sitemap.xml
// and /llms.txt (DOCS_MANIFEST_PATH in @repo/next-config/docs-zone). Public
// URLs, titles and dates only. Built with the docs, so it changes with the
// next docs deploy; the main app reads it at most hourly.

export const dynamic = "force-static";

export function GET() {
  return Response.json(docsManifest(), {
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
