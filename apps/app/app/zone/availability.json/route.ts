import { toPublishedAvailability } from "@repo/availability";
import { getPublicAvailability } from "@/lib/integration-availability";

// What this deployment offers, for QRdx's other deployments: the docs app
// reads it at build time for <IfAvailable> (PUBLISHED_AVAILABILITY_PATH in
// @repo/availability). The ids, paths and slugs every page already sends to
// browsers (components/root-document.tsx), plus the feature ids that are on;
// never variable names or values. Decided from the build's environment like
// the prerendered pages, so it changes with the next deploy, and CDNs may
// keep it for an hour.

export const dynamic = "force-static";

export function GET() {
  return Response.json(toPublishedAvailability(getPublicAvailability()), {
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
