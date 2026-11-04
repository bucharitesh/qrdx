import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import {
  ALL_PAGE_CODES,
  getPageCode,
  pageCodeProps,
} from "@/lib/landing/page-codes";
import { serializeQrSvg } from "@/lib/qr-render";

// The sample codes on the generator, industry and placement pages
// (lib/landing/page-codes) as SVG files (/sample-codes/<id>.svg), drawn by
// the engine and prerendered at build time. The pages load them as <img>s
// with their size reserved, so they stay out of the HTML and never shift
// the layout.

export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_PAGE_CODES.map((code) => ({ file: `${code.id}.svg` }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/sample-codes/[file]">,
) {
  const { file } = await params;
  const code = file.endsWith(".svg")
    ? getPageCode(file.slice(0, -".svg".length))
    : undefined;
  if (!code) return new Response("Not found", { status: 404 });

  const svg = serializeQrSvg(createElement(QRCodeSVG, pageCodeProps(code)));
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // A redeploy may redraw a code under the same name.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
