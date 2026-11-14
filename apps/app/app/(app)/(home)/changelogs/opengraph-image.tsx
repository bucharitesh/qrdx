import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { changelogEntries } from "./entries";

export const alt = "The QRdx changelog";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  const [latest] = changelogEntries();
  const date = latest
    ? new Date(latest.data.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  return renderPageOgImage({
    label: "Changelog",
    title: "What's new in QRdx",
    description: latest
      ? `Latest: ${latest.data.title}`
      : "Release notes for dynamic codes, hosted pages, integrations, the library and the CLI.",
    footer: date ? `Updated ${date} · Open source` : "Open source · qrdx.dev",
  });
}
