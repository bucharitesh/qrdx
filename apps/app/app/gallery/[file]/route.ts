import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { galleryCodeProps, getWallTile } from "@/lib/landing/showcase-gallery";
import { loadGalleryAssets } from "@/lib/landing/showcase-gallery-assets";
import { serializeQrSvg } from "@/lib/qr-render";
import { onDemandParams } from "@/lib/static-params";

// The "Made with QRdx" walls' codes as SVG files (/gallery/<id>.svg), drawn
// by the engine on their first request and cached from then on. The walls
// load them as lazy <img>s, so they stay off the critical path and out of the
// HTML. Unknown names answer 404.

/** None at build (lib/static-params.ts). Unknown names answer 404 below. */
export function generateStaticParams() {
  return onDemandParams();
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/gallery/[file]">,
) {
  const { file } = await params;
  const tile = file.endsWith(".svg")
    ? getWallTile(file.slice(0, -".svg".length))
    : undefined;
  if (!tile) return new Response("Not found", { status: 404 });

  const props = galleryCodeProps(tile, await loadGalleryAssets(tile));
  const svg = serializeQrSvg(createElement(QRCodeSVG, props));
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // A redeploy may redraw a code under the same name.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
