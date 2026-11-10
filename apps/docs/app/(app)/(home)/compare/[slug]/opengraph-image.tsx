import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { compareSource } from "@/lib/source";
import { buildTimeParams } from "@/lib/static-params";

export const alt = "QRdx compared with another QR code tool";
export const size = ogSize;
export const contentType = "image/png";

/** The tagline's first sentence: what the other tool is, in one line. */
function firstSentence(text: string): string {
  return /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
}

export function generateStaticParams() {
  return buildTimeParams(() =>
    compareSource.getPages().map((page) => ({ slug: page.slugs[0] })),
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = compareSource.getPage([slug]);
  if (!page) notFound();

  return renderPageOgImage({
    label: "Compare",
    title: `QRdx vs ${page.data.competitor}`,
    description: firstSentence(page.data.tagline),
  });
}
