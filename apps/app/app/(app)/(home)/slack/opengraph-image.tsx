import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { notFound } from "next/navigation";
import { isFeatureAvailable } from "@/lib/feature-availability";

export const alt = "The QRdx bot for Slack";
export const size = ogSize;
export const contentType = "image/png";

// Same rule as the page: none where the bot isn't set up.
export default function Image() {
  if (!isFeatureAvailable("slackBot")) notFound();
  return renderPageOgImage({
    label: "Slack bot",
    title: "Make QR codes in Slack with /qr",
    description:
      "Type /qr with a link or any text and the QRdx bot posts the code, with PNG and SVG downloads.",
    footer: "Free · Open source · qrdx.dev",
  });
}
