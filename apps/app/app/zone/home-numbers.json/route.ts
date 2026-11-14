import type { HomeNumbersDocument } from "@repo/next-config/home-numbers";
import { env } from "@/env";

// Whether the home page shows "QRdx in numbers", for QRdx's other
// deployments (@repo/next-config/home-numbers): the back-office console's
// numbers page can't see this build's QRDX_HOME_NUMBERS. Read from the value
// next.config.ts inlined when the app was built, as the home page reads it,
// so the two always agree; it changes with the next deploy, and CDNs may
// keep it for an hour.

export const dynamic = "force-static";

export function GET() {
  const document: HomeNumbersDocument = {
    version: 1,
    on: env.QRDX_HOME_NUMBERS === "1",
  };
  return Response.json(document, {
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
