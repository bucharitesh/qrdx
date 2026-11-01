import { cn } from "@repo/design-system/lib/utils";
import { Code1 } from "iconsax-reactjs";

/**
 * Local logo files in public, keyed by compare slug. Brand logos are drawn for
 * light backgrounds, so they always sit on a white tile (legible in light and
 * dark mode). The tile is round, so brands with a compact mark use it rather
 * than their wordmark. Open-source libraries without a logo get a code icon.
 */
const LOGOS: Partial<Record<string, string>> = {
  "adobe-express": "/compare/adobe-express.svg",
  "bitly-qr": "/integrations/bitly.svg",
  "canva-qr": "/compare/canva-qr.svg",
  dub: "/compare/dub.png",
  flowcode: "/compare/flowcode.svg",
  goqr: "/compare/goqr.png",
  hovercode: "/compare/hovercode.svg",
  "me-qr": "/compare/me-qr.svg",
  "qr-code-chimp": "/compare/qr-code-chimp.svg",
  "qr-code-generator-pro": "/compare/qr-code-generator-pro.png",
  "qr-code-io": "/compare/qr-code-io.svg",
  "qr-code-monkey": "/compare/qr-code-monkey.svg",
  "qr-tiger": "/compare/qr-tiger.svg",
  "qr-verse": "/compare/qr-verse.png",
  qrfy: "/compare/qrfy.png",
  qrstuff: "/compare/qrstuff.svg",
  scanova: "/compare/scanova.svg",
  uniqode: "/compare/uniqode.svg",
};

const SIZES = {
  sm: { tile: "size-8 p-1", icon: "size-4" },
  md: { tile: "size-10 p-1.5", icon: "size-5" },
  lg: { tile: "size-20 p-4 md:size-24 md:p-5", icon: "size-9 md:size-11" },
} as const;

interface CompetitorLogoProps {
  slug: string;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** A competitor's logo on a white tile, or a code icon when there's no file. */
export function CompetitorLogo({
  slug,
  name,
  size = "md",
  className,
}: CompetitorLogoProps) {
  const src = LOGOS[slug];

  return (
    <span
      className={cn(
        "grid shrink-0 grid-cols-1 grid-rows-1 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-black/10 dark:ring-white/10",
        SIZES[size].tile,
        className,
      )}
    >
      {src ? (
        <img
          alt={`${name} logo`}
          className="size-full object-contain"
          decoding="async"
          src={src}
        />
      ) : (
        <Code1
          aria-label={name}
          className={cn("text-neutral-700", SIZES[size].icon)}
          role="img"
        />
      )}
    </span>
  );
}
