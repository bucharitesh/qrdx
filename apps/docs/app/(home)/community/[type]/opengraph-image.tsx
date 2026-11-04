import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { COMMUNITY_LICENSE_NAME } from "@/lib/community/licence";
import { TYPE_SEGMENTS, typeFromSegment } from "@/lib/community/types";
import { COPY } from "./copy";

export const alt =
  "QR code frames, themes and collections from the QRdx community";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return Object.values(TYPE_SEGMENTS).map((type) => ({ type }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const type = typeFromSegment((await params).type);
  if (!type) notFound();

  return renderPageOgImage({
    label: "Community",
    title: COPY[type].title,
    description: COPY[type].intro,
    footer: `Free under ${COMMUNITY_LICENSE_NAME} · Open in the editor`,
  });
}
