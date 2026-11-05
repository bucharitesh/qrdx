"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { GalleryAdd, Trash } from "iconsax-reactjs";
import {
  getQRShapePath,
  getQRSilhouetteFit,
  loadQRSilhouette,
  QRCodeSVG,
} from "qrdx";
import type { QRSilhouette } from "qrdx/types";
import * as React from "react";
import {
  SILHOUETTE_ACCEPT,
  silhouetteFileProblem,
} from "@/lib/qr-design/silhouette";
import { soundEvent } from "@/lib/sound/emit";
import type { QRStyle } from "@/types/theme";
import { CompactTile, OptionGrid } from "./option-tiles";

// Shaped codes in Design → Frame: the code sits in a circle or a heart of
// decorative dots, or in a shape of your own traced from an upload (only
// the traced grid is kept, lib/qr-design/silhouette.ts). They set the
// style's `shape` or `silhouette`, as saved designs, links and the API
// already hold them. A shaped code takes the place of a frame: every frame
// paints a light plate under the code, which would hide the outline, so
// picking a shape clears the frame (and a border template), and picking a
// frame clears the shape (frame-controls.tsx).

export type FrameShapeId = "circle" | "heart" | "silhouette";

/** Names in the picker. "Circle" is taken by the ring frame with curved text. */
export const FRAME_SHAPE_NAMES: Record<FrameShapeId, string> = {
  circle: "Dot circle",
  heart: "Heart",
  silhouette: "Silhouette",
};

const SHAPE_HELP: Record<FrameShapeId, string> = {
  circle:
    "The code sits in a circle of decorative dots, with a clear ring around it. Scanners read only the code in the middle, so the circle is a little bigger for the same scan distance.",
  heart:
    "The code sits in a heart of decorative dots, with a clear ring around it. Scanners read only the code in the middle, so print a heart larger than a square code for the same scan distance.",
  silhouette:
    "The code sits in the roomiest middle part of your shape, with a clear ring around it. Only the outline is kept, never the picture, and links, the community and snippets use a square code.",
};

/** The shaped code a style draws, if any. */
export function frameShapeOf(style: Partial<QRStyle>): FrameShapeId | null {
  if (style.silhouette) return "silhouette";
  return style.shape === "circle" || style.shape === "heart"
    ? style.shape
    : null;
}

/** `style` without a shape (square code), for picking a frame. */
export function withoutShape<T extends Partial<QRStyle>>(style: T): T {
  if (style.shape === undefined && style.silhouette === undefined) return style;
  const { shape: _shape, silhouette: _silhouette, ...rest } = style;
  return rest as T;
}

/** `style` with a shaped code and no frame or border template. */
export function withShape(
  style: QRStyle,
  shape: { shape: "circle" | "heart" } | { silhouette: QRSilhouette },
): QRStyle {
  const {
    frame: _frame,
    templateId: _templateId,
    ...rest
  } = withoutShape(style);
  return { ...rest, ...shape };
}

const TILE = 40;

function ShapePreview({
  id,
  silhouette,
}: {
  id: FrameShapeId;
  silhouette: QRSilhouette | null;
}) {
  if (id === "silhouette" && !silhouette) {
    return <GalleryAdd aria-hidden className="text-neutral-500" size={18} />;
  }
  return (
    <QRCodeSVG
      bgColor="#ffffff"
      bodyPattern="square"
      cornerEyeDotPattern="square"
      cornerEyePattern="square"
      fgColor="#000000"
      shape={id === "silhouette" ? (silhouette ?? undefined) : id}
      size={TILE}
      style={{ maxHeight: "100%", maxWidth: "100%" }}
      value="qrdx.dev"
    />
  );
}

/** The traced outline on its own, as the code fills it. */
function SilhouetteOutline({ silhouette }: { silhouette: QRSilhouette }) {
  const path = getQRShapePath(silhouette, 56);
  return (
    <span className="bg-muted grid size-14 shrink-0 place-items-center rounded-[10px]">
      <svg aria-hidden className="fill-foreground size-12" viewBox="0 0 56 56">
        {path && <path d={path} />}
      </svg>
    </span>
  );
}

export function FrameShapes({
  style,
  setStyle,
}: {
  style: QRStyle;
  setStyle: (next: QRStyle) => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [picking, setPicking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  // The last silhouette, so it comes back after trying another shape
  const [lastSilhouette, setLastSilhouette] =
    React.useState<QRSilhouette | null>(style.silhouette ?? null);
  const silhouette = style.silhouette ?? null;
  const current = frameShapeOf(style) ?? (picking ? "silhouette" : null);

  React.useEffect(() => {
    if (silhouette) setLastSilhouette(silhouette);
  }, [silhouette]);
  // Picking a frame elsewhere ends an upload in progress
  React.useEffect(() => {
    if (style.frame && style.frame.style !== "none") setPicking(false);
  }, [style.frame]);

  const pick = (id: FrameShapeId) => {
    setProblem(null);
    soundEvent("tick");
    if (id !== "silhouette") {
      setPicking(false);
      setStyle(withShape(style, { shape: id }));
      return;
    }
    if (lastSilhouette) {
      setStyle(withShape(style, { silhouette: lastSilhouette }));
      return;
    }
    setPicking(true);
    fileInputRef.current?.click();
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const refused = silhouetteFileProblem(file);
    if (refused) {
      setProblem(refused);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      // Traced in the browser: the picture never leaves it
      const traced = await loadQRSilhouette(file);
      const fit = getQRSilhouetteFit(traced);
      if (!fit.ok) {
        setProblem(fit.message);
        return;
      }
      setPicking(false);
      setStyle(withShape(style, { silhouette: traced }));
      soundEvent("apply");
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Couldn't read that picture.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setProblem(null);
    setPicking(false);
    setLastSilhouette(null);
    setStyle(withoutShape(style));
  };

  return (
    <div className="space-y-3">
      <input
        accept={SILHOUETTE_ACCEPT}
        aria-label="Upload a silhouette"
        className="sr-only"
        onChange={upload}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-muted-foreground font-medium">Shaped code</span>
          {current && (
            <span className="text-foreground font-medium">
              {FRAME_SHAPE_NAMES[current]}
            </span>
          )}
        </div>
        <OptionGrid columns={6} label="Shaped code">
          {(Object.keys(FRAME_SHAPE_NAMES) as FrameShapeId[]).map((id) => (
            <CompactTile
              key={id}
              name={FRAME_SHAPE_NAMES[id]}
              onSelect={() => pick(id)}
              selected={current === id}
            >
              <ShapePreview id={id} silhouette={silhouette ?? lastSilhouette} />
            </CompactTile>
          ))}
        </OptionGrid>
      </div>

      {current === "silhouette" && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          {silhouette ? (
            <SilhouetteOutline silhouette={silhouette} />
          ) : (
            <span className="bg-muted text-muted-foreground grid size-14 shrink-0 place-items-center rounded-[10px]">
              <GalleryAdd aria-hidden size={20} />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-muted-foreground text-xs text-pretty">
              PNG, JPEG or SVG: a dark or solid shape on a light or clear
              background.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <GalleryAdd />
                {busy ? "Tracing…" : silhouette ? "Replace" : "Upload a shape"}
              </Button>
              {silhouette && (
                <Button
                  onClick={remove}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {problem && (
        <p className="text-destructive text-xs text-pretty" role="alert">
          {problem}
        </p>
      )}
      {current && (
        <p className="text-muted-foreground text-xs text-pretty">
          {SHAPE_HELP[current]}
        </p>
      )}
    </div>
  );
}
