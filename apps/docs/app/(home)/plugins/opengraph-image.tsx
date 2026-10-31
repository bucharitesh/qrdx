import { ImageResponse } from "next/og";
import { BrandOgImage, loadOgFonts, ogSize } from "@/app/og/brand";

export const alt = "QRdx plugins: QR codes in Chrome, Figma, Raycast and Canva";
export const size = ogSize;
export const contentType = "image/png";

export default async function Image() {
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
