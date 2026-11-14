import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { getPublishedPosts } from "./_lib/posts";

export const alt = "The QRdx blog";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  const posts = getPublishedPosts().length;
  return renderPageOgImage({
    label: "Blog",
    title: "QR code guides, engineering and product news",
    description:
      "How QR codes work, honest generator comparisons and notes from the team behind QRdx.",
    footer: `${posts} ${posts === 1 ? "post" : "posts"} · qrdx.dev`,
  });
}
