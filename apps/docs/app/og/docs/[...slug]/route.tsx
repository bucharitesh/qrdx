import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { BrandOgImage, loadOgFonts, ogSize } from "@/app/og/brand";
import { docsIndex } from "@/lib/docs-index";
import { onDemandParams } from "@/lib/static-params";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const page = docsIndex().getPage(slug.slice(0, -1));
  if (!page) {
    notFound();
  }

  return new ImageResponse(
    <BrandOgImage
      description={page.data.description}
      label="Docs"
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
