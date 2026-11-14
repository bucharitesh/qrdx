import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { findCatalogTile, tileSize } from "@/components/docs/qr-catalog-tiles";
import { serializeQrSvg } from "@/lib/qr-render";
import { onDemandParams } from "@/lib/static-params";

// The docs style catalogue's codes (/docs/styles) as SVG files
// (/catalog/<tile id>.svg), drawn by the same engine at the size the page
// shows them, on their first request and cached from then on. The page
// loads them as lazy <img>s: two hundred inline SVGs made it a 3 MB document.
// Unknown names answer 404.

/** None at build (lib/static-params.ts). Unknown names answer 404 below. */
export function generateStaticParams() {
  return onDemandParams();
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/catalog/[file]">,
) {
  const { file } = await params;
  const found = file.endsWith(".svg")
    ? findCatalogTile(file.slice(0, -".svg".length))
    : undefined;
  if (!found) return new Response("Not found", { status: 404 });

  const svg = serializeQrSvg(
    createElement(QRCodeSVG, {
      ...found.tile.props,
      size: tileSize(found.kind),
    }),
  );
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // A redeploy may redraw a code under the same name.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
