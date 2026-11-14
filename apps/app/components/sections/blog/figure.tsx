import Image from "next/image";

interface FigureProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
}

/** Inline blog image. Explicit width/height reserve space to prevent layout shift. */
export function Figure({ src, alt, width, height, caption }: FigureProps) {
  return (
    <figure className="not-prose my-8">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        sizes="(min-width: 1280px) 780px, (min-width: 640px) 85vw, 100vw"
        className="h-auto w-full rounded-xl border border-border bg-muted"
      />
      {caption && (
        <figcaption className="mt-3 text-center text-sm text-muted-foreground text-balance">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
