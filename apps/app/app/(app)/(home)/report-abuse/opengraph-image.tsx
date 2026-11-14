import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";

export const alt = "Report a QRdx QR code";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Safety",
    title: "Report a QR code",
    description:
      "A QRdx code that leads to phishing, malware or a scam? Tell us. We review every report.",
    footer: "qrdx.dev/report-abuse",
  });
}
