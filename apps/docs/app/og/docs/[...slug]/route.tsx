import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { BrandOgImage, loadOgFonts, ogSize } from "@/app/og/brand";
import { getPageImage, source } from "@/lib/source";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
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

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
}
