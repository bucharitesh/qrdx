import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { getPageCode, pageCodeProps } from "@/lib/landing/page-codes";
import { serializeQrSvg } from "@/lib/qr-render";
import { onDemandParams } from "@/lib/static-params";

// The sample codes on the generator, industry and placement pages
// (lib/landing/page-codes) as SVG files (/sample-codes/<id>.svg), drawn by
// the engine on their first request and cached from then on. The pages load
// them as <img>s with their size reserved, so they stay out of the HTML and
// never shift the layout. Unknown names answer 404. Same pattern as the home
// wall's images (app/gallery/[file]/route.ts).

/** None at build (lib/static-params.ts). */
export function generateStaticParams() {
  return onDemandParams();
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
