"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Slider } from "@repo/design-system/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import { GalleryAdd, GalleryEdit } from "iconsax-reactjs";
import {
  getImageTones,
  type ImageFit,
  type ImagePaint,
  type ImagePosition,
  type ImageToneMap,
  type ImageTones,
} from "qrdx";
import { getNormalizedColor } from "qrdx/types";
import { useEffect, useId, useRef, useState } from "react";
import { parseColorString, toHex } from "@/lib/paint/color-math";
import { IMAGE_FILL_MAX_LENGTH } from "@/lib/paint/saved-paint";
import { CHECKER_STYLE } from "./controls";

// The Image tab: a picture painted through the shapes (an image fill).
// Pictures are read here, in the browser, and kept as a data URL like a
// logo; nothing is fetched from a web address.

/** Largest picture the picker reads (before it is scaled down). */
export const PICTURE_MAX_BYTES = 10 * 1024 * 1024;
/** Longest side a picture is kept at: sharp at print sizes, small to save. */
const PICTURE_MAX_SIDE = 1024;

/** `img` at `side` px at most, as JPEG, or PNG when it has transparency. */
function encodePicture(img: HTMLImageElement, side: number): string {
  const scale = Math.min(
    1,
    side / Math.max(img.naturalWidth, img.naturalHeight, 1),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't read the image.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] as number) < 250) {
      transparent = true;
      break;
    }
  }
  return transparent
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.86);
}

/**
 * A picked file as a data URL, scaled down to PICTURE_MAX_SIDE: JPEG for
 * photos, PNG when it has transparency.
 */
export async function readPicture(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    throw new Error("Pick a PNG, JPEG or WebP image.");
  }
  if (file.size > PICTURE_MAX_BYTES) {
    throw new Error("Pick an image under 10 MB.");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // Saved designs take a picture of IMAGE_FILL_MAX_LENGTH at most: step
    // the size down until it fits (a photo at 1024 px is far below it)
    for (const side of [PICTURE_MAX_SIDE, 768, 512, 384]) {
      const encoded = encodePicture(img, side);
      if (encoded.length <= IMAGE_FILL_MAX_LENGTH) return encoded;
    }
    throw new Error("This image is too detailed to keep. Try a smaller one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Tones ──────────────────────────────────────────────────────────────────

const toneCache = new Map<string, ImageTones | null>();
const pending = new Map<string, Promise<void>>();

/** True once a picture's tones were measured (or couldn't be). */
export const pictureMeasured = (src: string) => toneCache.has(src);

/**
 * Tones (lightest and darkest tenth) of every picture in `sources`, for the
 * contrast readout. Measured once per picture, in the browser; every
 * mounted reader re-renders when a measurement lands.
 */
export function useImageTones(sources: string[]): ImageToneMap {
  const [, bump] = useState(0);
  const key = sources.join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the sources
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) bump((count) => count + 1);
    };
    for (const src of sources) {
      if (toneCache.has(src)) continue;
      let job = pending.get(src);
      if (!job) {
        job = getImageTones(src)
          .then((tones) => {
            toneCache.set(src, tones);
          })
          .catch(() => {
            toneCache.set(src, null);
          })
          .finally(() => {
            pending.delete(src);
          });
        pending.set(src, job);
      }
      job.then(refresh, refresh);
    }
    return () => {
      alive = false;
    };
  }, [key]);
  const tones: ImageToneMap = {};
  for (const src of sources) {
    const known = toneCache.get(src);
    if (known) tones[src] = known;
  }
  return tones;
}

// ── Controls ───────────────────────────────────────────────────────────────

const FITS: { id: ImageFit; label: string }[] = [
  { id: "cover", label: "Fill" },
  { id: "contain", label: "Fit" },
  { id: "tile", label: "Tile" },
];

const POSITIONS: { id: ImagePosition; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top", label: "Top" },
  { id: "top-right", label: "Top right" },
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom", label: "Bottom" },
  { id: "bottom-right", label: "Bottom right" },
];

/** A file input behind a button; reports the picture or the error. */
export function PicturePicker({
  children,
  onPicture,
  onError,
  variant = "outline",
  className,
}: {
  children: React.ReactNode;
  onPicture: (src: string) => void;
  onError: (message: string) => void;
  variant?: "outline" | "ghost" | "default";
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            onPicture(await readPicture(file));
          } catch (error) {
            onError(
              error instanceof Error
                ? error.message
                : "Couldn't read the image.",
            );
          } finally {
            setBusy(false);
          }
        }}
        ref={ref}
        tabIndex={-1}
        type="file"
      />
      <Button
        className={className}
        disabled={busy}
        onClick={() => ref.current?.click()}
        size="sm"
        type="button"
        variant={variant}
      >
        {children}
      </Button>
    </>
  );
}

/** The empty Image tab: pick a picture to paint with. */
export function PictureEmpty({
  onPicture,
}: {
  onPicture: (src: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="border-input flex flex-col items-center gap-2 rounded-md border border-dashed px-3 py-6 text-center">
        <GalleryAdd aria-hidden className="text-muted-foreground size-6" />
        <p className="text-muted-foreground text-xs text-pretty">
          Paint a picture through these shapes. PNG, JPEG or WebP, up to 10 MB.
        </p>
        <PicturePicker
          className="h-8 text-xs"
          onError={setError}
          onPicture={(src) => {
            setError(null);
            onPicture(src);
          }}
        >
          Choose a picture
        </PicturePicker>
      </div>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Opacity and scale: a slider with its percentage. */
function PercentSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        aria-label={label}
        max={max * 100}
        min={min * 100}
        onValueChange={([next]) => onChange((next ?? value * 100) / 100)}
        step={1}
        value={[Math.round(value * 100)]}
      />
    </div>
  );
}

/** The underlay: a solid color under the picture, or none. */
function UnderlayField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <div className="space-y-1.5">
      <label className="text-muted-foreground text-xs" htmlFor={id}>
        Underlay
      </label>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="relative size-8 shrink-0 overflow-hidden rounded-md"
          style={CHECKER_STYLE}
        >
          <span
            className="absolute inset-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
            style={{ background: value ?? "transparent" }}
          />
        </span>
        <Input
          className="h-8 min-w-0 flex-1 px-2 font-mono text-xs uppercase"
          id={id}
          onBlur={() => setDraft(value ?? "")}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = parseColorString(event.target.value);
            if (parsed && event.target.value.replace(/^#/, "").length >= 3) {
              onChange(toHex({ ...parsed, a: 1 }));
            }
          }}
          placeholder="None"
          spellCheck={false}
          title="A solid color under the picture; its opacity lets it through"
          value={draft}
        />
        {value && (
          <Button
            className="h-8 px-2 text-xs"
            onClick={() => onChange(undefined)}
            size="sm"
            type="button"
            variant="ghost"
          >
            None
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * An image fill's settings: the picture (replace), fill/fit/tile, position,
 * scale, opacity and the underlay.
 */
export function ImageFillEditor({
  paint,
  onChange,
}: {
  paint: ImagePaint;
  onChange: (paint: ImagePaint) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ImagePaint>) => onChange({ ...paint, ...patch });
  const fit = paint.fit ?? "cover";
  return (
    <div className="space-y-3">
      <div
        className="relative h-28 overflow-hidden rounded-md"
        style={CHECKER_STYLE}
      >
        {/* The underlay, then the picture at its opacity, as the code draws it */}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: paint.underlay ?? "transparent" }}
        />
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: getNormalizedColor({ ...paint, underlay: undefined }),
            opacity: paint.opacity ?? 1,
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
        />
        <PicturePicker
          className="bg-background/90 absolute right-2 bottom-2 h-7 gap-1 px-2 text-xs"
          onError={setError}
          onPicture={(src) => {
            setError(null);
            set({ src });
          }}
        >
          <GalleryEdit className="size-3.5" />
          Replace
        </PicturePicker>
      </div>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}

      <ToggleGroup
        aria-label="How the picture fills the code"
        className="bg-muted grid w-full grid-cols-3 gap-0 rounded-lg p-0.5"
        onValueChange={(next) => next && set({ fit: next as ImageFit })}
        type="single"
        value={fit}
      >
        {FITS.map((item) => (
          <ToggleGroupItem
            className="text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground dark:data-[state=on]:bg-input/40 h-7 min-w-0 rounded-md px-1 text-xs font-medium hover:bg-transparent data-[state=on]:shadow-sm"
            key={item.id}
            value={item.id}
          >
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-start gap-3">
        <ToggleGroup
          aria-label="Position"
          className={cn(
            "grid shrink-0 grid-cols-3 gap-0.5",
            fit === "tile" && "pointer-events-none opacity-40",
          )}
          disabled={fit === "tile"}
          onValueChange={(next) =>
            next && set({ position: next as ImagePosition })
          }
          type="single"
          value={paint.position ?? "center"}
        >
          {POSITIONS.map((item) => (
            <ToggleGroupItem
              aria-label={item.label}
              className="data-[state=on]:bg-foreground border-input size-5 min-w-0 rounded-sm border p-0 data-[state=on]:border-transparent"
              key={item.id}
              title={item.label}
              value={item.id}
            />
          ))}
        </ToggleGroup>
        <div className="min-w-0 flex-1 space-y-3">
          <PercentSlider
            label={fit === "tile" ? "Tile size" : "Scale"}
            max={4}
            min={0.1}
            onChange={(scale) => set({ scale })}
            value={paint.scale ?? 1}
          />
          <PercentSlider
            label="Opacity"
            max={1}
            min={0}
            onChange={(opacity) => set({ opacity })}
            value={paint.opacity ?? 1}
          />
        </div>
      </div>

      <UnderlayField
        onChange={(underlay) => set({ underlay })}
        value={paint.underlay}
      />

      <p className="text-muted-foreground text-[11px] text-pretty">
        The picture stays with this design, like a logo: it isn't shared in
        links or published styles, and EPS can't carry it.
      </p>
    </div>
  );
}
