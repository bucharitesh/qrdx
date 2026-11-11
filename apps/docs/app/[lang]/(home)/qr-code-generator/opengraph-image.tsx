import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { localeParams, requireLocaleParam } from "@/lib/i18n/static-params";
import { QR_TYPES } from "@/lib/qr-types-content";

export const alt = "Every QR code type QRdx makes";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return localeParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  await requireLocaleParam(params);
  return renderPageOgImage({
    label: "QR code types",
    title: `${QR_TYPES.length} QR code types, each with a free generator`,
    description:
      "Wi-Fi, vCard, WhatsApp, UPI, email, social profiles and payments, with each payload format.",
  });
}
