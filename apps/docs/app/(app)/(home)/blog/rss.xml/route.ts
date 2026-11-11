import { resolveAuthors } from "@/lib/blog-authors";
import { absoluteUrl, BLOG_RSS_PATH, getPublishedPosts } from "../_lib/posts";

export const revalidate = false;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const posts = getPublishedPosts();
  const blogUrl = absoluteUrl("/blog");
  const lastBuildDate = new Date(
    Math.max(
      0,
      ...posts.map((p) => new Date(p.data.updated ?? p.data.date).getTime()),
    ),
  ).toUTCString();

  const items = posts
    .map((post) => {
      const url = absoluteUrl(post.url);
      const creators = resolveAuthors(post.data.author)
        .map((a) => `      <dc:creator>${escapeXml(a.name)}</dc:creator>`)
        .join("\n");

      return [
        "    <item>",
        `      <title>${escapeXml(post.data.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${new Date(post.data.date).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(post.data.description ?? "")}</description>`,
        `      <category>${escapeXml(post.data.category)}</category>`,
        creators,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>QRdx Blog</title>
    <link>${blogUrl}</link>
    <description>QR code guides, engineering deep dives and product news from QRdx, the open-source QR code generator.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${absoluteUrl(BLOG_RSS_PATH)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
