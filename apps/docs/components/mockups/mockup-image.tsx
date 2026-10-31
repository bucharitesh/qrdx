import { cn } from "@repo/design-system/lib/utils";
import Image from "next/image";

export interface MockupImageProps {
  src: string;
  /** Dark-theme variant, shown instead of `src` when the site is in dark mode. */
  darkSrc?: string;
  alt: string;
  width: number;
  height: number;
  /** Above-the-fold hero image: preloaded with high fetch priority. */
  priority?: boolean;
  sizes?: string;
  /** Skip the border, radius and shadow, e.g. inside BrowserFrame or PhoneFrame. */
  bare?: boolean;
  className?: string;
}

const FRAMED = "rounded-xl border border-border shadow-lg shadow-black/5";

/**
 * next/image with consistent framing. width/height reserve the space (no
 * layout shift); images load lazily unless `priority` is set.
 */
export function MockupImage({
  src,
  darkSrc,
  alt,
  width,
  height,
  priority = false,
  sizes = "(min-width: 1280px) 1200px, 100vw",
  bare = false,
  className,
}: MockupImageProps) {
  const base = cn("block h-auto w-full bg-muted", !bare && FRAMED, className);

  if (!darkSrc) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        preload={priority}
        loading={priority ? undefined : "lazy"}
        className={base}
      />
    );
  }

  // Both variants share the slot; the hidden one is lazy, so the browser
  // only downloads it if the theme switches to it.
  return (
    <>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        preload={priority}
        loading={priority ? undefined : "lazy"}
        className={cn(base, "dark:hidden")}
      />
      <Image
        src={darkSrc}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading="lazy"
        className={cn(base, "hidden dark:block")}
      />
    </>
  );
}
