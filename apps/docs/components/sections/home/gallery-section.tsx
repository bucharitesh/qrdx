import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { EASE_CLASS } from "@/components/mockups/motion";
import { PresetLink } from "@/components/playground/preset-link";
import { SectionHeader } from "@/components/sections/section-header";
import { TEMPLATES_PATH } from "@/lib/landing/demo-paths";
import {
  type GalleryFilter as Filter,
  GALLERY_CHECKER,
  GALLERY_CODES,
  GALLERY_FILTERS,
  type GalleryCode,
  galleryImage,
} from "@/lib/landing/showcase-gallery";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import { defaultPresets } from "@/utils/qr-presets";
import { GalleryFilter } from "./gallery-filter";

// Home page gallery: real codes in the built-in themes, one per content type
// and one per style (lib/landing/showcase-gallery.ts). Each code is an SVG
// the engine draws at build time (app/gallery/[file]/route.ts), loaded as a
// lazy <img> in a fixed square, so it costs the first paint nothing and
// never shifts the layout. The page frame stays monochrome; the codes carry
// the color.

const THEME_COUNT = Object.keys(defaultPresets).length;

const TILE_LINK =
  "group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

function TileLink({
  code,
  children,
}: {
  code: GalleryCode;
  children: ReactNode;
}) {
  // No prefetch: two dozen links to the playground and docs bundles.
  return code.appliesPreset ? (
    <PresetLink preset={code.preset} prefetch={false} className={TILE_LINK}>
      {children}
    </PresetLink>
  ) : (
    <Link href={code.href} prefetch={false} className={TILE_LINK}>
      {children}
    </Link>
  );
}

/** Printer's crop marks just outside the code (the inset-[14%] box). */
function CropMarks() {
  const trim = 14;
  const gap = 2.5;
  const length = 7;
  const corners = [
    [trim, trim, -1, -1],
    [100 - trim, trim, 1, -1],
    [trim, 100 - trim, -1, 1],
    [100 - trim, 100 - trim, 1, 1],
  ] as const;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 size-full text-foreground/45"
    >
      {corners.map(([x, y, dx, dy]) => (
        <g key={`${x}-${y}`} stroke="currentColor" strokeWidth="0.35">
          <line x1={x + dx * gap} x2={x + dx * (gap + length)} y1={y} y2={y} />
          <line x1={x} x2={x} y1={y + dy * gap} y2={y + dy * (gap + length)} />
        </g>
      ))}
    </svg>
  );
}

function Tile({ code }: { code: GalleryCode }) {
  const image = galleryImage(code);
  // Plain codes get soft corners; frames have their own outline, and the
  // print code keeps the square edge its crop marks point at.
  const rounded = !(image.framed || code.print || code.transparent);
  return (
    <TileLink code={code}>
      <Card className="h-full gap-0 py-0 transition-colors duration-200 group-hover:border-foreground/15">
        <div className="p-1.5 pb-0">
          <div className="relative aspect-square overflow-hidden rounded-[14px] bg-muted/60 dark:bg-muted/50">
            <div
              className={cn(
                "absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                EASE_CLASS,
              )}
            >
              {code.transparent && (
                <span
                  aria-hidden="true"
                  className="absolute inset-[14%] rounded-[3px]"
                  style={{
                    backgroundImage: `repeating-conic-gradient(${GALLERY_CHECKER.dark} 0% 25%, ${GALLERY_CHECKER.light} 0% 50%)`,
                    backgroundSize: "12px 12px",
                  }}
                />
              )}
              {code.print && <CropMarks />}
              <img
                src={image.src}
                alt={code.alt}
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
                className={cn(
                  "absolute inset-[14%] size-[72%] object-contain",
                  rounded && "rounded-[6px]",
                )}
              />
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 px-3 pt-2.5 pb-3">
          <h3 className="truncate text-sm font-medium tracking-tight text-foreground">
            {code.label}
          </h3>
          {/* Two lines on phones (two narrow columns), one line from sm up. */}
          <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground sm:line-clamp-1 sm:min-h-0">
            {code.detail}
          </p>
        </div>
      </Card>
    </TileLink>
  );
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group/link inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className={cn(
          "size-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5 motion-reduce:transition-none",
          EASE_CLASS,
        )}
      />
    </Link>
  );
}

const MORE: Record<Filter, ReactNode> = {
  style: (
    <MoreLink href="/playground">
      Browse all {THEME_COUNT} themes in the playground
    </MoreLink>
  ),
  content: (
    <>
      <MoreLink href="/qr-code-generator">
        All {QR_TYPE_SLUGS.length} QR code generators
      </MoreLink>
      <MoreLink href={TEMPLATES_PATH}>Page templates</MoreLink>
    </>
  ),
};

function Panel({ filter }: { filter: Filter }) {
  const codes = GALLERY_CODES.filter((code) => code.filter === filter);
  return (
    <div className="flex flex-col items-center gap-10">
      <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {codes.map((code) => (
          <li key={code.id}>
            <Tile code={code} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {MORE[filter]}
      </div>
    </div>
  );
}

export function GallerySection() {
  return (
    <section
      id="gallery"
      aria-labelledby="gallery-heading"
      className="flex w-full flex-col items-center"
    >
      <SectionHeader eyebrow="Gallery" pattern="wave">
        <h2
          id="gallery-heading"
          className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance"
        >
          Every kind of QR code
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          Real codes in the built-in themes, drawn by the playground's renderer.
          Scan any of them with your phone.
        </p>
      </SectionHeader>
      <div className="w-full px-10 py-12 md:py-16">
        <GalleryFilter
          panels={GALLERY_FILTERS.map(({ value, label }) => ({
            value,
            label,
            content: <Panel filter={value} />,
          }))}
        />
      </div>
    </section>
  );
}
