import { cn } from "@repo/design-system/lib/utils";
import Image from "next/image";

/**
 * A changelog entry's picture filling its (16:9, positioned) frame, with
 * its dark-theme version when it has one. The hidden one is lazy, so only
 * the shown one downloads.
 */
export function ChangelogPicture({
  src,
  darkSrc,
  alt,
  sizes,
  className,
}: {
  src: string;
  darkSrc?: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const image = (url: string, themeClass?: string) => (
    <Image
      alt={alt}
      className={cn("object-cover", themeClass, className)}
      fill
      loading="lazy"
      sizes={sizes}
      src={url}
    />
  );
  return darkSrc ? (
    <>
      {image(src, "dark:hidden")}
      {image(darkSrc, "hidden dark:block")}
    </>
  ) : (
    image(src)
  );
}
