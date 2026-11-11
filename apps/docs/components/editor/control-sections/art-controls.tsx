"use client";

import { toast } from "@repo/design-system";
import {
  Spinner as LoaderCircle,
  Tick,
  Close as X,
} from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/design-system/components/ui/collapsible";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, GalleryAdd as ImageUp, InfoCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  DEFAULT_ART_INTENSITY,
  getQRData,
  getScanScore,
  loadQRArtImage,
  QRCodeSVG,
  type ScanScoreResult,
  withQRSize,
} from "qrdx";
import type { QRArt, QRArtImage, QRArtMode, QRArtVariant } from "qrdx/types";
import * as React from "react";
import {
  GRADE_COLORS,
  ScanCheckList,
  useGradeLabels,
} from "@/components/editor/scan-score";
import { useEditorValue } from "@/components/editor/style-scope";
import { DEFAULT_QR_LOGO, MAX_LOGO_FILE_SIZE } from "@/lib/constants";
import { soundEvent } from "@/lib/sound/emit";
import { useArtSessionStore } from "@/store/art-session-store";
import type { QRStyle } from "@/types/theme";
import { ART_COLOR_ISSUE_COPY, artColorFix, artColorIssue } from "./art-colors";
import {
  ART_RECOMMENDED,
  ART_SAMPLES,
  ART_STRENGTHS,
  ART_VARIANT_OPTIONS,
  type ArtSample,
  DEFAULT_ART_STRENGTH,
} from "./art-presets";
import { OptionGrid, OptionGroupLabel } from "./option-tiles";

// Same rules as the logo upload (components/editor/control-sections/logo-controls.tsx)
const ALLOWED_ART_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

const SCORE_DEBOUNCE_MS = 700;

/** The look `art` renders with in `mode` (the mode's default when unset). */
function variantOption(mode: QRArtMode, art: QRArt | undefined) {
  const options = ART_VARIANT_OPTIONS[mode];
  const id = art?.mode === mode ? art.variant : undefined;
  return options.find((option) => option.id === id) ?? options[0]!;
}

/**
 * Which sample produced a sampled image, so the grid keeps its selection when
 * the Art tab remounts. Keyed by the image's pixel data.
 */
const pickedSamples = new Map<string, string>();

/** Error correction H and a 4-module quiet zone, for codes that lack them. */
export function recommendedSettings(style: QRStyle): Partial<QRStyle> {
  const extra: Partial<QRStyle> = {};
  if (style.level !== ART_RECOMMENDED.level) {
    extra.level = ART_RECOMMENDED.level;
  }
  if ((style.margin ?? 0) < ART_RECOMMENDED.minMargin) {
    extra.margin = ART_RECOMMENDED.minMargin;
  }
  return extra;
}

/**
 * `style` with `image` as its Image QR or Logo QR art, plus the settings art
 * needs to scan. Same mode: the chosen look (variant, eye colors, …) stays.
 */
export function withArtImage(
  style: QRStyle,
  image: QRArtImage,
  mode: QRArtMode,
  intensity = DEFAULT_ART_STRENGTH,
): QRStyle {
  const { art: previous, ...rest } = style;
  return {
    ...rest,
    ...recommendedSettings(style),
    art: {
      ...(previous?.mode === mode ? previous : {}),
      mode,
      image,
      intensity,
    },
  };
}

export type VectorArt = ReturnType<typeof useVectorArt>;

/**
 * Logo QR and Image QR state for the Art tab: the design's art, the last
 * source image (kept for the visit, so switching mode re-samples it) and the
 * actions on them.
 */
export function useVectorArt(
  styles: QRStyle,
  onChange: (styles: QRStyle) => void,
) {
  const t = useTranslations("editor.controlSections.artControls");
  const art = styles.art;
  const source = useArtSessionStore((state) => state.source);
  const setSource = useArtSessionStore((state) => state.setSource);
  const pick = useArtSessionStore((state) => state.pick);
  const [isLoading, setIsLoading] = React.useState(false);

  const update = (next: QRArt | undefined, extra: Partial<QRStyle> = {}) => {
    const { art: _previous, ...rest } = styles;
    onChange({ ...rest, ...extra, ...(next && { art: next }) });
  };

  const applyImage = async (
    input: Blob | string,
    mode: QRArtMode,
    options: { intensity?: number; sampleId?: string } = {},
  ) => {
    setIsLoading(true);
    try {
      const image = await loadQRArtImage(input, { mode });
      if (options.sampleId) {
        pickedSamples.set(image.data, options.sampleId);
      }
      setSource(input);
      pick(null);
      // Art codes lean on error correction and a clear border to scan.
      onChange(withArtImage(styles, image, mode, options.intensity));
      soundEvent("apply");
    } catch (error) {
      toast.error(
        options.sampleId
          ? t("couldntLoadThisSample")
          : t("couldntUseThisImage"),
        {
          description: options.sampleId
            ? t("checkYourConnectionAndTry")
            : error instanceof Error
              ? error.message
              : t("tryAPngOrJpg"),
        },
      );
    } finally {
      setIsLoading(false);
    }
  };

  /** Logo QR or Image QR picked in the Art tab's mode toggle. */
  const chooseMode = (mode: QRArtMode) => {
    if (art?.mode === mode) {
      pick(null);
    } else if (source) {
      pick(art ? null : mode);
      void applyImage(source, mode, { intensity: art?.intensity });
    } else if (art) {
      // No original in this visit: reuse the sampled image.
      pick(null);
      if (art.mode !== mode) update({ ...art, mode });
    } else {
      pick(mode);
    }
  };

  /** Off: a plain code again. */
  const removeArt = () => {
    setSource(null);
    pick(null);
    if (art) update(undefined);
  };

  return { art, isLoading, update, applyImage, chooseMode, removeArt };
}

interface ArtControlsProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
  /** The mode the Art tab shows (the design's art, or one picked before an image) */
  mode: QRArtMode;
  vector: VectorArt;
}

/** Logo QR and Image QR: vector art modes from the qrdx library. */
export function ArtControls({
  styles,
  onChange,
  mode,
  vector,
}: ArtControlsProps) {
  const t = useTranslations("editor.controlSections.artControls");
  const style = styles;
  const { art, isLoading, update, applyImage, removeArt } = vector;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pickedSample = art ? pickedSamples.get(art.image.data) : undefined;
  const followsRecommended =
    Object.keys(recommendedSettings(style)).length === 0;
  // Art only renders dark-on-light; say so instead of staying silently plain.
  const colorIssue = artColorIssue(style);

  const applySample = (sample: ArtSample) => {
    if (isLoading) return;
    void applyImage(sample.src, mode, {
      intensity: art?.intensity,
      sampleId: sample.id,
    });
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_ART_TYPES.includes(file.type)) {
      toast.error(t("unsupportedImageFormat"), {
        description: t("useAPngJpgWebp"),
      });
      return;
    }
    if (file.size > MAX_LOGO_FILE_SIZE) {
      toast.error(t("imageIsTooLarge"), {
        description: t("imagesMustBeValueMb", {
          value: MAX_LOGO_FILE_SIZE / 1024 / 1024,
        }),
      });
      return;
    }
    void applyImage(file, mode, { intensity: art?.intensity });
  };

  const customLogo = style.customLogo?.startsWith("data:")
    ? style.customLogo
    : null;

  return (
    <div className="space-y-4">
      {colorIssue && (
        <div className="bg-muted/40 flex flex-col gap-2.5 rounded-lg border p-3">
          <p className="text-muted-foreground flex gap-2 text-xs" role="status">
            <InfoCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
            {ART_COLOR_ISSUE_COPY[colorIssue]}
          </p>
          <Button
            className="self-start"
            onClick={() => {
              const fix = artColorFix(style);
              if (fix) onChange({ ...style, ...fix } as QRStyle);
            }}
            size="sm"
            variant="outline"
          >
            {colorIssue === "inverted"
              ? t("swapDotAndBackgroundColors")
              : t("putTheDotsOnWhite")}
          </Button>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {t("hintFinderAlignmentAndFormat", {
          hint: variantOption(mode, art).hint,
        })}
      </p>
      <ArtSampleGrid
        key={mode}
        label={t(`modeCopy.${mode}.samples`)}
        mode={mode}
        onPick={applySample}
        selected={art?.mode === mode ? pickedSample : undefined}
      />
      <div className="flex flex-wrap gap-2">
        <input
          accept={ALLOWED_ART_TYPES.join(",")}
          aria-label={t(`modeCopy.${mode}.upload`)}
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
          {isLoading ? <LoaderCircle className="animate-spin" /> : <ImageUp />}
          {art ? t("uploadAnother") : t("uploadYourOwn")}
        </Button>
        {mode === "logo" && customLogo && (
          <Button
            disabled={isLoading}
            onClick={() => void applyImage(customLogo, "logo")}
            size="sm"
            variant="ghost"
          >
            {t("useMyLogo")}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {t("uploadPngJpgWebpOr", {
          upload: t(`modeCopy.${mode}.upload`),
          value: MAX_LOGO_FILE_SIZE / 1024 / 1024,
        })}
      </p>

      {art && (
        <>
          <div>
            <OptionGroupLabel>{t("look")}</OptionGroupLabel>
            <ToggleGroup
              aria-label={t("artLook")}
              className="w-full"
              onValueChange={(id) => {
                if (id) update({ ...art, variant: id as QRArtVariant });
              }}
              type="single"
              value={variantOption(art.mode, art).id}
              variant="outline"
            >
              {ART_VARIANT_OPTIONS[art.mode].map((option) => (
                <ToggleGroupItem
                  className="flex-1 text-xs"
                  key={option.id}
                  value={option.id}
                >
                  {option.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {art.mode === "logo" && (
            <div className="flex items-center justify-between gap-3">
              <Label
                className="cursor-pointer text-xs"
                htmlFor="art-match-eyes"
              >
                {t("eyesMatchTheLogo")}
              </Label>
              <Switch
                checked={art.matchEyes !== false}
                id="art-match-eyes"
                onCheckedChange={(checked) =>
                  update({ ...art, matchEyes: checked })
                }
              />
            </div>
          )}
          <ArtStrength
            onChange={(intensity) => update({ ...art, intensity })}
            value={art.intensity ?? DEFAULT_ART_INTENSITY}
          />
          {followsRecommended ? (
            <p className="text-muted-foreground text-xs">
              {t("usesHighErrorCorrectionAnd")}
            </p>
          ) : (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-xs">
              {t.rich("artScansBestWithHigh", {
                button: (chunks) => (
                  <Button
                    className="h-auto p-0 text-xs"
                    onClick={() => update(art, recommendedSettings(style))}
                    size="sm"
                    variant="link"
                  >
                    {chunks}
                  </Button>
                ),
              })}
            </p>
          )}
          <ArtScanScore art={art} style={style} />
          <Button
            className="w-full"
            onClick={removeArt}
            size="sm"
            variant="ghost"
          >
            <X />
            {t("removeArt")}
          </Button>
        </>
      )}
    </div>
  );
}

/** Sample logos or photos: one click turns them into an art code. */
function ArtSampleGrid({
  mode,
  label,
  selected,
  onPick,
}: {
  mode: QRArtMode;
  label: string;
  selected: string | undefined;
  onPick: (sample: ArtSample) => void;
}) {
  // Samples whose file failed to load are left out.
  const [missing, setMissing] = React.useState<string[]>([]);
  const samples = ART_SAMPLES[mode].filter(
    (sample) => !missing.includes(sample.id),
  );
  if (samples.length === 0) return null;

  return (
    <div>
      <OptionGroupLabel>{label}</OptionGroupLabel>
      <OptionGrid className="@[26rem]:grid-cols-6" columns={3} label={label}>
        {samples.map((sample) => {
          const isSelected = selected === sample.id;
          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "group bg-card relative flex min-w-0 flex-col items-center gap-1 rounded-lg border p-1 pb-1.5 text-center transition-[background-color,border-color,transform] outline-none active:scale-[0.97]",
                "hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
                isSelected &&
                  "border-foreground/40 bg-accent/60 hover:border-foreground/40",
              )}
              key={sample.id}
              onClick={() => onPick(sample)}
              type="button"
            >
              <span
                className={cn(
                  "block aspect-square w-full overflow-hidden rounded-[10px] bg-white ring-1 ring-black/5",
                  mode === "logo" && "p-1",
                )}
              >
                <img
                  alt=""
                  className={cn(
                    "size-full",
                    mode === "halftone" ? "object-cover" : "object-contain",
                  )}
                  decoding="async"
                  draggable={false}
                  height={96}
                  loading="lazy"
                  onError={() =>
                    setMissing((previous) => [...previous, sample.id])
                  }
                  src={sample.src}
                  width={96}
                />
              </span>
              <span
                className={cn(
                  "text-muted-foreground w-full truncate text-[11px] leading-tight font-medium",
                  isSelected && "text-foreground",
                )}
              >
                {sample.name}
              </span>
              {isSelected && (
                <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full shadow-sm">
                  <Tick className="size-3" />
                </span>
              )}
            </button>
          );
        })}
      </OptionGrid>
    </div>
  );
}

/** Subtle / Balanced / Bold, with the raw slider under "Fine-tune". */
function ArtStrength({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("editor.controlSections.artControls");
  const preset = ART_STRENGTHS.find(
    (strength) => Math.abs(strength.value - value) < 0.001,
  );
  const [fineTune, setFineTune] = React.useState(!preset);
  const percent = Math.round(value * 100);

  return (
    <div className="space-y-2">
      <OptionGroupLabel
        kbd={<span className="font-normal tabular-nums">{percent}%</span>}
      >
        {t("strength")}
      </OptionGroupLabel>
      <ToggleGroup
        aria-label={t("artStrength")}
        className="w-full"
        onValueChange={(id) => {
          const next = ART_STRENGTHS.find((strength) => strength.id === id);
          if (next) onChange(next.value);
        }}
        type="single"
        value={preset?.id ?? ""}
        variant="outline"
      >
        {ART_STRENGTHS.map((strength) => (
          <ToggleGroupItem
            className="flex-1 text-xs"
            key={strength.id}
            value={strength.id}
          >
            {strength.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Collapsible onOpenChange={setFineTune} open={fineTune}>
        <CollapsibleTrigger asChild>
          <Button
            className="text-muted-foreground -ml-2.5 h-7 text-xs"
            size="sm"
            variant="ghost"
          >
            {t("fineTune")}
            <ArrowDown2
              className={cn(
                "size-3.5 transition-transform duration-200",
                fineTune && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          <Slider
            aria-label={t("artStrength")}
            max={100}
            min={0}
            onValueChange={([next]) =>
              onChange((next ?? DEFAULT_ART_STRENGTH * 100) / 100)
            }
            step={5}
            value={[percent]}
          />
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>{t("easierToScan")}</span>
            <span>{t("moreArt")}</span>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** Live preview of the art code plus the library's scan score for it. */
function ArtScanScore({ art, style }: { art: QRArt; style: QRStyle }) {
  const gradeLabels = useGradeLabels();
  const t = useTranslations("editor.controlSections.artControls");
  const value = useEditorValue();
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
          <p className="text-xs font-medium">{t("scanCheck")}</p>
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
                {gradeLabels[result.grade]}
              </span>
              {checking && (
                <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
              )}
            </p>
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoaderCircle className="size-3.5 animate-spin" />
              {t("checking")}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {value ? t("decodedInYourBrowserAt") : t("addContentToCheckYour")}
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
