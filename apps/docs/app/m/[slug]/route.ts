import { getEasterEgg } from "@/lib/easter-eggs";

type Context = { params: Promise<{ slug: string }> };

/**
 * Where the site's decorative QR codes land (lib/easter-eggs.ts). A plain
 * redirect: no cookies, no tracking, no database. Unknown slugs go home.
 */
export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params;
  const egg = getEasterEgg(slug);
  return new Response(null, {
    status: 307,
    headers: {
      Location: egg?.url ?? "/",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
