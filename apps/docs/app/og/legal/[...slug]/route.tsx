import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { BrandOgImage, loadOgFonts, ogSize } from "@/app/og/brand";
import { legalSource } from "@/lib/content-source";
import { onDemandParams } from "@/lib/static-params";

// Legal pages live under an optional catch-all, which can't hold an
// opengraph-image file, so their images are served here (like the docs').
export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/legal/[...slug]">,
) {
  const { slug } = await params;
  const page = legalSource.getPage(slug.slice(0, -1));
  if (!page) {
    notFound();
  }

  return new ImageResponse(
    <BrandOgImage
      description={page.data.description}
      footer="QRdx · qrdx.dev/legal"
      label="Legal"
      title={page.data.title}
    />,
    { ...ogSize, fonts: await loadOgFonts() },
  );
}

// None at build: each image renders on its first request and is cached
// (lib/static-params.ts). Unknown pages answer notFound() above.
export function generateStaticParams() {
  return onDemandParams();
}
