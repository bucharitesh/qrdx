import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { BrandOgImage, loadOgFonts, ogSize } from "@/app/og/brand";
import { docsIndex, getPageImage } from "@/lib/docs-index";
import { buildTimeParams } from "@/lib/static-params";

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

// Unknown pages answer notFound() above (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    docsIndex()
      .getPages()
      .map((page) => ({
        lang: page.locale,
        slug: getPageImage(page).segments,
      })),
  );
}
