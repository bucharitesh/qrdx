"use client";

import { Close as X } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft2 as ChevronLeft,
  ArrowRight2 as ChevronRight,
  GallerySlash as ImageOff,
} from "iconsax-reactjs";
import {
  type KeyboardEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface GalleryGridImage {
  id: string;
  src: string;
  alt: string;
  caption: string;
}

const COLUMNS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
} as const;
const SWIPE_PX = 40;

/** Thumbnail that shows a neutral tile when the image can't load. */
function Thumbnail({
  image,
  shape,
}: {
  image: GalleryGridImage;
  shape: "square" | "original";
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  // An error before hydration is missed by onError; check once mounted.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-(--lp-muted) text-(--lp-muted-fg) text-xs">
        <ImageOff aria-hidden="true" className="size-5" />
        Image unavailable
      </span>
    );
  }
  return (
    <img
      alt={image.alt}
      className={cn(
        "block w-full bg-(--lp-muted)",
        shape === "square" ? "aspect-square object-cover" : "h-auto",
      )}
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      ref={ref}
      src={image.src}
    />
  );
}

/**
 * Photo grid; tapping a photo opens it full screen in a modal <dialog>
 * (focus trap, Esc to close, arrow keys and swipe to browse, focus returns
 * to the photo).
 */
export function GalleryGrid({
  images,
  columns,
  shape,
  blockId,
}: {
  images: GalleryGridImage[];
  columns: 1 | 2 | 3;
  shape: "square" | "original";
  blockId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStart = useRef<number | null>(null);
  const [index, setIndex] = useState<number | null>(null);

  const open = (next: number) => {
    setIndex(next);
    dialogRef.current?.showModal();
    document.documentElement.style.overflow = "hidden";
  };

  const close = useCallback(() => dialogRef.current?.close(), []);

  const step = useCallback(
    (by: number) =>
      setIndex((current) =>
        current === null
          ? null
          : (current + by + images.length) % images.length,
      ),
    [images.length],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      document.documentElement.style.overflow = "";
      setIndex((current) => {
        if (current !== null) triggers.current[current]?.focus();
        return null;
      });
    };
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("close", onClose);
      document.documentElement.style.overflow = "";
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowLeft") step(-1);
  };
  const onTouchStart = (event: TouchEvent) => {
    touchStart.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start === null || end === undefined) return;
    if (end - start > SWIPE_PX) step(-1);
    else if (start - end > SWIPE_PX) step(1);
  };

  const current = index === null ? null : images[index];
  const many = images.length > 1;

  return (
    <>
      <ul className={cn("grid gap-2", COLUMNS[columns])}>
        {images.map((image, i) => (
          <li key={image.id}>
            <button
              aria-label={`Open photo ${i + 1} of ${images.length}${image.alt ? `: ${image.alt}` : ""}`}
              className="block w-full overflow-hidden rounded-(--lp-radius) focus-visible:outline-2 focus-visible:outline-(--lp-primary) focus-visible:outline-offset-2"
              data-lp-block={blockId}
              data-lp-target={`photo-${i + 1}`}
              onClick={() => open(i)}
              ref={(node) => {
                triggers.current[i] = node;
              }}
              type="button"
            >
              <Thumbnail image={image} shape={shape} />
            </button>
            {image.caption && columns === 1 && (
              <p className="mt-1.5 text-center text-(--lp-muted-fg) text-sm">
                {image.caption}
              </p>
            )}
          </li>
        ))}
      </ul>

      <dialog
        aria-label={
          current
            ? `Photo ${(index ?? 0) + 1} of ${images.length}`
            : "Photo viewer"
        }
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/95 p-0 text-white backdrop:bg-black/60 open:flex open:flex-col"
        onClick={(event) => {
          // Taps on the dark area around the photo close the viewer.
          const target = event.target as HTMLElement;
          if (target === event.currentTarget || target.dataset.backdrop)
            close();
        }}
        onKeyDown={onKeyDown}
        onTouchEnd={onTouchEnd}
        onTouchStart={onTouchStart}
        ref={dialogRef}
      >
        <div className="flex items-center justify-between gap-2 p-3">
          <span
            aria-live="polite"
            className="text-sm text-white/80 tabular-nums"
          >
            {current && many ? `${(index ?? 0) + 1} / ${images.length}` : ""}
          </span>
          <button
            aria-label="Close"
            className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-2"
          data-backdrop="true"
        >
          {current && (
            <img
              alt={current.alt}
              className="max-h-full max-w-full select-none object-contain"
              decoding="async"
              key={current.id}
              src={current.src}
            />
          )}
          {many && (
            <>
              <button
                aria-label="Previous photo"
                className="-translate-y-1/2 absolute top-1/2 left-2 flex size-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white"
                onClick={() => step(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="size-6" />
              </button>
              <button
                aria-label="Next photo"
                className="-translate-y-1/2 absolute top-1/2 right-2 flex size-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white"
                onClick={() => step(1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="size-6" />
              </button>
            </>
          )}
        </div>
        <p className="min-h-12 px-4 py-3 text-center text-sm text-white/90">
          {current?.caption}
        </p>
      </dialog>
    </>
  );
}
