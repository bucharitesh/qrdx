import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { requireLocaleParam, withLocaleParams } from "@/lib/i18n/static-params";
import {
  getQrType,
  getQrTypeTitle,
  QR_TYPE_SLUGS,
} from "@/lib/qr-types-content";
import {
  getHostedQrType,
  HOSTED_TYPE_SLUGS,
} from "@/lib/qr-types-content-hosted";

export const alt = "A free QR code generator for one type of content";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return withLocaleParams(() =>
    [...QR_TYPE_SLUGS, ...HOSTED_TYPE_SLUGS].map((type) => ({ type })),
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; type: string }>;
}) {
  await requireLocaleParam(params);
  const { type } = await params;
  const hosted = getHostedQrType(type);
  if (hosted) {
    return renderPageOgImage({
      label: "QR code types",
      title: hosted.title,
      description: hosted.summary,
      footer: "Free account · Edit after printing",
    });
  }
  const content = getQrType(type);
  if (!content) notFound();

  return renderPageOgImage({
    label: "QR code types",
    title: getQrTypeTitle(content),
    description: content.summary,
  });
}
