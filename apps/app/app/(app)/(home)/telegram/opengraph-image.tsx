import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { notFound } from "next/navigation";
import { isFeatureAvailable } from "@/lib/feature-availability";

export const alt = "The QRdx bot for Telegram";
export const size = ogSize;
export const contentType = "image/png";

// Same rule as the page: none where the bot isn't set up.
export default function Image() {
  if (!isFeatureAvailable("telegramBot")) notFound();
  return renderPageOgImage({
    label: "Telegram bot",
    title: "Make QR codes in any Telegram chat",
    description:
      "Message the QRdx bot, call it inline in any chat, or use /qr in a group.",
    footer: "Free · No account · Open source",
  });
}
