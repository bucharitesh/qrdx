import { cn } from "@repo/design-system/lib/utils";

/**
 * Local logo files in public/compare, keyed by compare slug. Brand logos are
 * drawn for light backgrounds, so they always sit on a white tile (legible in
 * light and dark mode). Entries without a file get a neutral monogram.
 */
const LOGOS: Partial<Record<string, string>> = {
  "adobe-express": "/compare/adobe-express.svg",
  "bitly-qr": "/compare/bitly-qr.svg",
  "canva-qr": "/compare/canva-qr.svg",
  flowcode: "/compare/flowcode.svg",
  goqr: "/compare/goqr.png",
  "me-qr": "/compare/me-qr.svg",
  "qr-code-chimp": "/compare/qr-code-chimp.svg",
  "qr-code-io": "/compare/qr-code-io.svg",
  "qr-code-monkey": "/compare/qr-code-monkey.svg",
  "qr-tiger": "/compare/qr-tiger.svg",
  qrstuff: "/compare/qrstuff.svg",
  uniqode: "/compare/uniqode.svg",
};

const SIZES = {
  sm: "size-8 p-1 text-xs",
  md: "size-10 p-1.5 text-sm",
  lg: "size-20 p-4 text-2xl md:size-24 md:p-5 md:text-3xl",
} as const;

interface CompetitorLogoProps {
  slug: string;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** A competitor's logo on a white tile, or a monogram when there's no file. */
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
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-black/10 dark:ring-white/10",
        SIZES[size],
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
        <span
          aria-label={`${name} logo`}
          className="font-semibold leading-none text-neutral-700"
          role="img"
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
