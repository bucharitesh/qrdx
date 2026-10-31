"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import { ImageUp, LoaderCircle, X } from "lucide-react";
import {
  DEFAULT_ART_INTENSITY,
  getQRData,
  getScanScore,
  loadQRArtImage,
  QRCodeSVG,
  type ScanScoreResult,
  withQRSize,
} from "qrdx";
import type { QRArt, QRArtMode } from "qrdx/types";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import {
  GRADE_COLORS,
  GRADE_LABELS,
  ScanCheckList,
} from "@/components/editor/scan-score";
import { DEFAULT_QR_LOGO, MAX_LOGO_FILE_SIZE } from "@/lib/constants";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";

// Same rules as the logo upload (components/editor/control-sections/logo-controls.tsx)
const ALLOWED_ART_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

type ArtChoice = "classic" | QRArtMode;
type StyleWithArt = QRStyle & { art?: QRArt };

const MODE_COPY: Record<QRArtMode, { upload: string; hint: string }> = {
  logo: {
    upload: "Upload a logo (transparent PNG or SVG works best)",
    hint: "Modules inside your logo take its colors; the rest fade to a lighter tone. Finder, timing and alignment patterns stay solid.",
  },
  halftone: {
    upload: "Upload a photo",
    hint: "Every module shows your photo around a small center square that keeps the true dark/light value, so scanners still read it.",
  },
};

/** Intensity a fresh art code starts at, per mode. */
const START_INTENSITY: Record<QRArtMode, number> = {
  logo: 0.7,
  halftone: 0.8,
};

const SCORE_DEBOUNCE_MS = 700;

interface ArtControlsProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
}

/** Logo QR and halftone Image QR: vector art modes from the qrdx library. */
export function ArtControls({ styles, onChange }: ArtControlsProps) {
  const style = styles as StyleWithArt;
  const art = style.art;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Picked mode before an image exists, and the last upload for re-sampling.
  const [pendingMode, setPendingMode] = React.useState<QRArtMode | null>(null);
  const [source, setSource] = React.useState<Blob | string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const choice: ArtChoice = art?.mode ?? pendingMode ?? "classic";

  const update = (next: QRArt | undefined, extra: Partial<QRStyle> = {}) => {
    const { art: _previous, ...rest } = style;
    onChange({ ...rest, ...extra, ...(next && { art: next }) } as QRStyle);
  };

  const applyImage = async (
    input: Blob | string,
    mode: QRArtMode,
    intensity?: number,
  ) => {
    setIsLoading(true);
    try {
      const image = await loadQRArtImage(input, { mode });
      setSource(input);
      setPendingMode(null);
      // Art codes lean on error correction, so start them at level H.
      update(
        { mode, image, intensity: intensity ?? START_INTENSITY[mode] },
        style.level === "H" ? {} : { level: "H" },
      );
      if (style.level !== "H") {
        toast.info("Error correction set to H", {
          description: "Art codes scan more reliably with the highest level.",
        });
      }
    } catch (error) {
      toast.error("Couldn't use this image", {
        description:
          error instanceof Error ? error.message : "Try a PNG or JPG instead.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoice = (value: string) => {
    if (!value) return;
    if (value === "classic") {
      setPendingMode(null);
      update(undefined);
      return;
    }
    const mode = value as QRArtMode;
    if (source) {
      void applyImage(source, mode, art?.intensity);
    } else if (art) {
      // No original in this session: reuse the sampled image.
      update({ ...art, mode });
    } else {
      setPendingMode(mode);
    }
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_ART_TYPES.includes(file.type)) {
      toast.error("Unsupported image format", {
        description: "Use a PNG, JPG, WebP or SVG image.",
      });
      return;
    }
    if (file.size > MAX_LOGO_FILE_SIZE) {
      toast.error("Image is too large", {
        description: `Images must be ${MAX_LOGO_FILE_SIZE / 1024 / 1024}MB or smaller.`,
      });
      return;
    }
    if (choice !== "classic") {
      void applyImage(file, choice, art?.intensity);
    }
  };

  const customLogo = style.customLogo?.startsWith("data:")
    ? style.customLogo
    : null;

  return (
    <ControlSection title="Art">
      <div className="space-y-4">
        <ToggleGroup
          aria-label="Art mode"
          className="w-full"
          onValueChange={handleChoice}
          type="single"
          value={choice}
          variant="outline"
        >
          <ToggleGroupItem className="flex-1 text-xs" value="classic">
            Classic
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1 text-xs" value="logo">
            Logo QR
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1 text-xs" value="halftone">
            Image QR
          </ToggleGroupItem>
        </ToggleGroup>

        {choice === "classic" ? (
          <p className="text-muted-foreground text-xs">
            Blend a logo or photo into the modules themselves. Vector output, no
            AI, works in every download format.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              {MODE_COPY[choice].hint}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                accept={ALLOWED_ART_TYPES.join(",")}
                aria-label={MODE_COPY[choice].upload}
                className="sr-only"
                onChange={handleUpload}
                ref={fileInputRef}
                type="file"
              />
              <Button
                className="flex-1"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                variant="outline"
              >
                {isLoading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ImageUp />
                )}
                {art ? "Replace image" : "Upload image"}
              </Button>
              {choice === "logo" && customLogo && (
                <Button
                  disabled={isLoading}
                  onClick={() => void applyImage(customLogo, "logo")}
                  size="sm"
                  variant="ghost"
                >
                  Use my logo
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {MODE_COPY[choice].upload}. PNG, JPG, WebP or SVG, up to{" "}
              {MAX_LOGO_FILE_SIZE / 1024 / 1024}MB. The image stays in your
              browser; only a small color grid is saved with the design.
            </p>

            {art && (
              <>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-xs" htmlFor="art-intensity">
                      Intensity
                    </Label>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {Math.round(
                        (art.intensity ?? DEFAULT_ART_INTENSITY) * 100,
                      )}
                      %
                    </span>
                  </div>
                  <Slider
                    id="art-intensity"
                    max={100}
                    min={0}
                    onValueChange={([value]) =>
                      update({ ...art, intensity: (value ?? 60) / 100 })
                    }
                    step={5}
                    value={[
                      Math.round(
                        (art.intensity ?? DEFAULT_ART_INTENSITY) * 100,
                      ),
                    ]}
                  />
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>Easier to scan</span>
                    <span>More art</span>
                  </div>
                </div>
                <ArtScanScore art={art} style={style} />
                <Button
                  className="w-full"
                  onClick={() => {
                    setSource(null);
                    update(undefined);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <X />
                  Remove art
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </ControlSection>
  );
}

/** Live preview of the art code plus the library's scan score for it. */
function ArtScanScore({ art, style }: { art: QRArt; style: StyleWithArt }) {
  const value = useQREditorStore((state) => state.value);
  const [result, setResult] = React.useState<ScanScoreResult | null>(null);
  const [checking, setChecking] = React.useState(false);

  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        value: value || "https://qrdx.dev",
        fgColor: style.fgColor,
        bgColor: style.bgColor,
        eyeColor: style.eyeColor,
        dotColor: style.dotColor,
        bodyPattern: style.bodyPattern,
        hideLogo: !style.showLogo,
        logo: style.customLogo ?? DEFAULT_QR_LOGO,
      }),
      level: style.level,
      cornerEyePattern: style.cornerEyePattern,
      cornerEyeDotPattern: style.cornerEyeDotPattern,
      templateId: style.templateId,
      frame: style.frame,
      margin: style.margin,
      art,
    }),
    [value, style, art],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    const timer = setTimeout(() => {
      getScanScore(qrProps, { signal: controller.signal })
        .then(setResult)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            console.error("Art scan score failed:", error);
            setResult(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setChecking(false);
        });
    }, SCORE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [qrProps]);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <QRCodeSVG
          {...withQRSize(qrProps, 240)}
          aria-hidden
          className="size-20 shrink-0 rounded"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium">Scan check</p>
          {result ? (
            <p className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={cn(
                  "size-2.5 rounded-full",
                  GRADE_COLORS[result.grade],
                )}
              />
              <span className="tabular-nums">{result.score}</span>
              <span className="text-muted-foreground">
                {GRADE_LABELS[result.grade]}
              </span>
              {checking && (
                <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
              )}
            </p>
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoaderCircle className="size-3.5 animate-spin" />
              Checking…
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {value
              ? "Decoded in your browser at three sizes."
              : "Add content to check your real code."}
          </p>
        </div>
      </div>
      {result && result.grade !== "great" && (
        <ScanCheckList
          checks={result.checks.filter((check) => !check.passed).slice(0, 3)}
        />
      )}
    </div>
  );
}
