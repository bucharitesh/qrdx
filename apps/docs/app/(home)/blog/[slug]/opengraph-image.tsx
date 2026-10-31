import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { resolveAuthors } from "@/lib/blog-authors";
import { blogSource } from "@/lib/source";
import { getPostSlug, getPublishedPosts } from "../_lib/posts";

export const alt = "QRdx Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOGO_PATH =
  "M0 49.78C0 22.285 22.285 0 49.78 0H76.285C84.14 0 90.505 6.37 90.505 14.22C90.505 22.07 84.135 28.44 76.285 28.44H49.78C38 28.44 28.445 37.99 28.445 49.775V76.28C28.445 84.135 22.075 90.5 14.225 90.5C6.375 90.5 0 84.14 0 76.285V49.78ZM165.495 14.22C165.495 6.37 171.865 0 179.715 0H206.22C233.715 0 256 22.285 256 49.78V76.285C256 84.14 249.635 90.505 241.78 90.505C233.925 90.505 227.56 84.135 227.56 76.285V49.78C227.56 38 218.01 28.445 206.225 28.445H179.72C171.865 28.445 165.495 22.075 165.495 14.22ZM14.22 165.495C22.075 165.495 28.44 171.86 28.44 179.715V206.22C28.44 218 37.99 227.555 49.775 227.555H76.28C84.135 227.555 90.5 233.925 90.5 241.775C90.5 249.63 84.13 255.995 76.28 255.995H49.78C22.285 256 0 233.715 0 206.22V179.715C0 171.865 6.37 165.495 14.22 165.495ZM241.78 165.495C249.635 165.495 256 171.86 256 179.715V206.22C256 233.71 233.715 256 206.22 256H179.715C171.86 256 165.495 249.635 165.495 241.78C165.495 233.925 171.865 227.56 179.715 227.56H206.22C218 227.56 227.555 218.01 227.555 206.225V179.72C227.555 171.865 233.925 165.495 241.78 165.495ZM99.555 56.89H56.89V99.555H99.555V156.445H56.89V199.11H99.555V156.445H156.445V199.11H199.11V156.445H156.445V99.555H199.11V56.89H156.445V99.555H99.555V56.89Z";

export function generateStaticParams() {
  return getPublishedPosts().map((p) => ({ slug: getPostSlug(p) }));
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = blogSource.getPage([slug]);

  if (!page || !page.data.published) {
    notFound();
  }

  const { title, category } = page.data;
  const authorNames = resolveAuthors(page.data.author)
    .map((a) => a.name)
    .join(", ");

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        background:
          "linear-gradient(180deg, #FDFDFD 0%, #FDFDFD 35%, #155DFC 100%)",
        color: "#0A0A0A",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="52" height="52" viewBox="0 0 256 256">
          <path d={LOGO_PATH} fill="#0A0A0A" />
        </svg>
        <div style={{ display: "flex", fontSize: 44, letterSpacing: -1 }}>
          QRdx
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#525252" }}>
          / Blog
        </div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: title.length > 70 ? 56 : 68,
          lineHeight: 1.12,
          letterSpacing: -2,
          maxWidth: 1050,
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 28,
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex" }}>{authorNames}</div>
        <div style={{ display: "flex" }}>{category}</div>
      </div>
    </div>,
    size,
  );
}
