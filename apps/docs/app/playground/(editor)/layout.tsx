import { PRODUCT_FACTS } from "@/lib/product-facts";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";

const LINKS = [
  { href: "/qr-code-generator", label: "All QR code types" },
  { href: "/tools/scan-checker", label: "Scan checker" },
  { href: "/tools/print-size", label: "Print size calculator" },
  { href: "/docs/styles", label: "Style guide" },
];

/**
 * What the designer does, for screen readers and crawlers that don't run
 * JavaScript. Not shown on screen (the owner removed the visible strip under
 * the editor); the same honest description stays in the first HTML.
 *
 * It lives here, not in page.tsx: ./loading.tsx wraps the page in a Suspense
 * boundary, so everything the page renders reaches the HTML as a hidden chunk
 * that only JavaScript reveals. A layout renders outside its own segment's
 * loading boundary. Plain links and no client components.
 */
function PlaygroundIntro() {
  const { bodyPatterns, eyeShapes, frames } = PRODUCT_FACTS;
  return (
    <section aria-label="About the QR code designer" className="sr-only">
      <p>
        Custom QR code designer. Free static codes with your logo, colors and
        frames. No signup, no watermark.
      </p>
      <p>
        Make a QR code for a link, Wi-Fi network, contact card, payment or any
        of {CONTENT_TYPES_METADATA.length} content types. Style it with{" "}
        {bodyPatterns} dot patterns, {eyeShapes} corner-eye shapes, solid or
        gradient colors, a center logo and {frames} call-to-action frames. The
        scan score estimates how well it will read before you print.
      </p>
      <p>
        Download PNG, JPG or SVG, or a print-ready PDF or EPS at an exact size.
        Static codes are free and never expire. Sign in to make a dynamic code
        you can edit after printing and track scans.
      </p>
      <ul>
        {LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /playground only; shared theme links ([...qrId]) canonicalize here. */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PlaygroundIntro />
    </>
  );
}
