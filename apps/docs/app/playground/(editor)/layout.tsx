import { ArrowUp2 } from "iconsax-reactjs";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";

const LINKS = [
  { href: "/qr-code-generator", label: "All QR code types" },
  { href: "/tools/scan-checker", label: "Scan checker" },
  { href: "/tools/print-size", label: "Print size calculator" },
  { href: "/docs/styles", label: "Style guide" },
];

/**
 * What the designer does, for crawlers that don't run JavaScript. It lives
 * here, not in page.tsx: ./loading.tsx wraps the page in a Suspense boundary,
 * so everything the page renders reaches the HTML as a hidden chunk that only
 * JavaScript reveals. A layout renders outside its own segment's loading
 * boundary, so this is in the first HTML, where it shows.
 *
 * A one-line strip under the editor on desktop (nothing above it moves) that
 * opens to two short paragraphs. Plain links and no client components, so
 * nothing here waits for JavaScript.
 */
function PlaygroundIntro() {
  const { bodyPatterns, eyeShapes, frames } = PRODUCT_FACTS;
  return (
    // Desktop only (the editor's own 768px breakpoint): on phones the sticky
    // Download/Share bar owns the bottom of a short screen. Still in the HTML.
    <details className="group bg-background text-muted-foreground hidden shrink-0 border-t text-xs md:block">
      <summary className="hover:text-foreground flex h-9 cursor-pointer list-none items-center gap-3 px-4 transition-colors [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          <span className="text-foreground font-medium">
            Custom QR code designer.
          </span>{" "}
          Free static codes with your logo, colors and frames. No signup, no
          watermark.
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          About
          <ArrowUp2
            aria-hidden
            className="size-3.5 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="max-h-[40svh] max-w-3xl space-y-2 overflow-y-auto px-4 pb-4 leading-relaxed">
        <p>
          Make a QR code for a link, Wi-Fi network, contact card, payment or any
          of {CONTENT_TYPES_METADATA.length} content types. Style it with{" "}
          {bodyPatterns} dot patterns, {eyeShapes} corner-eye shapes, solid or
          gradient colors, a center logo and {frames} call-to-action frames. The
          scan score estimates how well it will read before you print.
        </p>
        <p>
          Download PNG, JPG or SVG, or a print-ready PDF or EPS at an exact
          size. Static codes are free and never expire. Sign in to make a
          dynamic code you can edit after printing and track scans.
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
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
