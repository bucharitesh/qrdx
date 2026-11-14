import { brandIndex, SIMPLE_ICONS_VERSION } from "@/lib/brand-logos/server";

// The logo gallery's search index: every Simple Icons brand as
// [slug, name, hex, aliases?], A to Z, without paths (about 47 KB gzipped).
// Built once at build time; the gallery fetches it when it opens, and each
// mark's image comes from ./[slug] as it scrolls into view.

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { version: SIMPLE_ICONS_VERSION, brands: brandIndex() },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
