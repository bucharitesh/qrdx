import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

export const ogSize = { width: 1200, height: 630 };

const BLUE = "#155DFC";

/** Geist for next/og. Falls back to the built-in font if the files can't be read. */
export async function loadOgFonts() {
  const dir = join(process.cwd(), "app/og/fonts");
  try {
    const [regular, semibold] = await Promise.all([
      readFile(join(dir, "Geist-Regular.ttf")),
      readFile(join(dir, "Geist-SemiBold.ttf")),
    ]);
    return [
      { name: "Geist", data: regular, weight: 400 as const },
      { name: "Geist", data: semibold, weight: 600 as const },
    ];
  } catch (error) {
    console.error("OG image: failed to load Geist fonts", error);
    return undefined;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

interface BrandOgImageProps {
  title: string;
  description?: string;
  /** Small pill next to the wordmark, e.g. "Docs" */
  label?: string;
  footer?: ReactNode;
}

export function BrandOgImage({
  title,
  description,
  label,
  footer = "Free · Open source · No signup",
}: BrandOgImageProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        fontFamily: "Geist",
        color: "#0A0A0A",
        backgroundColor: "#FDFDFD",
        backgroundImage: `radial-gradient(circle at 50% -10%, #FDFDFD 45%, ${BLUE} 130%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="56" height="56" viewBox="0 0 256 256" fill={BLUE}>
          <path d="M0 49.78C0 22.285 22.285 0 49.78 0H76.285C84.14 0 90.505 6.37 90.505 14.22C90.505 22.07 84.135 28.44 76.285 28.44H49.78C38 28.44 28.445 37.99 28.445 49.775V76.28C28.445 84.135 22.075 90.5 14.225 90.5C6.375 90.5 0 84.14 0 76.285V49.78ZM165.495 14.22C165.495 6.37 171.865 0 179.715 0H206.22C233.715 0 256 22.285 256 49.78V76.285C256 84.14 249.635 90.505 241.78 90.505C233.925 90.505 227.56 84.135 227.56 76.285V49.78C227.56 38 218.01 28.445 206.225 28.445H179.72C171.865 28.445 165.495 22.075 165.495 14.22ZM14.22 165.495C22.075 165.495 28.44 171.86 28.44 179.715V206.22C28.44 218 37.99 227.555 49.775 227.555H76.28C84.135 227.555 90.5 233.925 90.5 241.775C90.5 249.63 84.13 255.995 76.28 255.995H49.78C22.285 256 0 233.715 0 206.22V179.715C0 171.865 6.37 165.495 14.22 165.495ZM241.78 165.495C249.635 165.495 256 171.86 256 179.715V206.22C256 233.71 233.715 256 206.22 256H179.715C171.86 256 165.495 249.635 165.495 241.78C165.495 233.925 171.865 227.56 179.715 227.56H206.22C218 227.56 227.555 218.01 227.555 206.225V179.72C227.555 171.865 233.925 165.495 241.78 165.495ZM99.555 56.89H56.89V99.555H99.555V156.445H56.89V199.11H99.555V156.445H156.445V199.11H199.11V156.445H156.445V99.555H199.11V56.89H156.445V99.555H99.555V56.89Z" />
        </svg>
        <span style={{ fontSize: 48, fontWeight: 600, letterSpacing: -1.5 }}>
          QRdx
        </span>
        {label ? (
          <span
            style={{
              marginLeft: 8,
              padding: "6px 18px",
              borderRadius: 999,
              fontSize: 24,
              color: BLUE,
              backgroundColor: "rgba(21, 93, 252, 0.08)",
              border: "1px solid rgba(21, 93, 252, 0.25)",
            }}
          >
            {label}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          maxWidth: 1000,
        }}
      >
        <div
          style={{
            fontSize: title.length > 48 ? 60 : 72,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: -2.5,
          }}
        >
          {truncate(title, 90)}
        </div>
        {description ? (
          <div style={{ fontSize: 30, lineHeight: 1.35, color: "#404040" }}>
            {truncate(description, 140)}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontWeight: 600,
          color: "#0B1E4D",
        }}
      >
        {footer}
      </div>
    </div>
  );
}

/** Site-wide default image, served by app/opengraph-image.tsx and app/twitter-image.tsx */
export async function renderSiteOgImage() {
  return new ImageResponse(
    <BrandOgImage
      title="Free, open-source QR code generator"
      description="Custom colors, gradients, logos and dot patterns. Download PNG, SVG or JPG."
    />,
    { ...ogSize, fonts: await loadOgFonts() },
  );
}
