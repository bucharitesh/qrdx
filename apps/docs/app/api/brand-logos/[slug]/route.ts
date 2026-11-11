import { notFound } from "next/navigation";
import { POPULAR_BRAND_SLUGS } from "@/lib/brand-logos/popular";
import { getBrandIcon } from "@/lib/brand-logos/server";
import { BRAND_SLUG } from "@/lib/brand-logos/svg";
import { buildTimeParams } from "@/lib/static-params";

// One brand mark as SVG, in its brand color: the logo gallery's thumbnails
// and the source of a picked logo (the editor embeds it in the code's style
// as a data URL, so codes never load it from here). Popular brands are built
// at build time; the rest on first request, then cached.

export const dynamic = "force-static";

export function generateStaticParams() {
  return buildTimeParams(() => POPULAR_BRAND_SLUGS.map((slug) => ({ slug })));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/brand-logos/[slug]">,
) {
  const { slug } = await params;
  const icon = BRAND_SLUG.test(slug) ? getBrandIcon(slug) : null;
  if (!icon) notFound();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${icon.title.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)}</title><path fill="#${icon.hex}" d="${icon.path}"/></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=604800",
      // Opened directly, it's still only a picture.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
