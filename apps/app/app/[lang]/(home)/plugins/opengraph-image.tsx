import {
  BrandOgImage,
  loadOgFonts,
  ogSize,
} from "@repo/design-system/og/brand";
import { ImageResponse } from "next/og";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { onDemandParams } from "@/lib/static-params";

export const alt = "QRdx plugins: QR codes in Chrome, Figma, Raycast and Canva";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return onDemandParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  await requireLocaleParam(params);
  return new ImageResponse(
    <BrandOgImage
      label="Plugins"
      title="QR codes inside Chrome, Figma, Raycast and Canva"
      description="A browser extension, a Figma plugin, a Raycast extension and a Canva app. Styled codes without leaving your tools."
      footer="Free · Open source · No account"
    />,
    { ...ogSize, fonts: await loadOgFonts() },
  );
}
