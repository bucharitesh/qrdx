import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { getCustomerStories } from "./_lib/stories";

export const alt = "QRdx customers and their case studies";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  const stories = getCustomerStories().length;
  return renderPageOgImage({
    label: "Customers",
    title: "How companies use QRdx",
    description:
      "Case studies from companies that make their QR codes with QRdx.",
    footer: `${stories} ${stories === 1 ? "case study" : "case studies"} · qrdx.dev`,
  });
}
