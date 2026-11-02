import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import {
  GALLERY_CODES,
  galleryCodeProps,
  getGalleryCode,
} from "@/lib/landing/showcase-gallery";
import { loadGalleryAssets } from "@/lib/landing/showcase-gallery-assets";
import { serializeQrSvg } from "@/lib/qr-render";

// The home page gallery's codes as SVG files (/gallery/<id>.svg), drawn by
// the engine and prerendered at build time. The page loads them as lazy
// <img>s, so they stay off the critical path and out of the HTML.

export const dynamicParams = false;

export function generateStaticParams() {
  return GALLERY_CODES.map((code) => ({ file: `${code.id}.svg` }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/gallery/[file]">,
) {
  const { file } = await params;
  const code = file.endsWith(".svg")
    ? getGalleryCode(file.slice(0, -".svg".length))
    : undefined;
  if (!code) return new Response("Not found", { status: 404 });

  const props = galleryCodeProps(code, await loadGalleryAssets(code));
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
