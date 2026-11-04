import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import {
  getQrType,
  getQrTypeTitle,
  QR_TYPE_SLUGS,
} from "@/lib/qr-types-content";
import { buildTimeParams } from "@/lib/static-params";

export const alt = "A free QR code generator for one type of content";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return buildTimeParams(() => QR_TYPE_SLUGS.map((type) => ({ type })));
}

export default async function Image({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const content = getQrType(type);
  if (!content) notFound();

  return renderPageOgImage({
    label: "QR code types",
    title: getQrTypeTitle(content),
    description: content.summary,
  });
}
