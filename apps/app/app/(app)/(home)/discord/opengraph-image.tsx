import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { notFound } from "next/navigation";
import { isFeatureAvailable } from "@/lib/feature-availability";

export const alt = "The QRdx bot for Discord";
export const size = ogSize;
export const contentType = "image/png";

// Same rule as the page: none where the bot isn't set up.
export default function Image() {
  if (!isFeatureAvailable("discordBot")) notFound();
  return renderPageOgImage({
    label: "Discord bot",
    title: "Make QR codes in Discord with /qr",
    description:
      "A QR code for any link, text or message, in servers, DMs and group DMs.",
    footer: "Free · No account · Open source",
  });
}
