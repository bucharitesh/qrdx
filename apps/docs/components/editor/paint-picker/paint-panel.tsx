"use client";

import { Pipette } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import { Bookmark, Magicpen, Warning2 } from "iconsax-reactjs";
import type { ImageToneMap } from "qrdx";
import {
  type ColorConfig,
  type GradientStop,
  getNormalizedColor,
  type ImagePaint,
  isImagePaint,
  normalizeColorConfig,
} from "qrdx/types";
import {
  type ClipboardEvent,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEditableStyle } from "@/components/editor/style-scope";
import {
  type ColorModel,
  channelsOf,
  clamp,
  type HSBA,
  hsbaToHex,
  hsbToRgb,
  hslToRgb,
  MODEL_CHANNELS,
  parseColorString,
  type RGBA,
  rgbToHsl,
  round,
  sameColor,
  toHex,
  toHsba,
  withChannel,
} from "@/lib/paint/color-math";
import {
  makeScannable,
  type PaintRole,
  paintSafety,
  safetyDetail,
  safetyMessage,
} from "@/lib/paint/contrast";
import {
  MIN_STOPS,
  normalizeStops,
  removeStop,
  reverseStops,
  setStopColor,
} from "@/lib/paint/gradient-stops";
import {
  DEFAULT_SWATCHES,
  designColors,
  readRecent,
  readSaved,
  removeSaved,
  SAVED_KEY,
  swatchHex,
  toggleSaved,
} from "@/lib/paint/swatches";
import { presetBaseStyles, useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";
import {
  CHECKER_STYLE,
  ChannelSlider,
  ColorArea,
  HUE_TRACK,
  SwatchDot,
} from "./controls";
import { GradientBar, GradientToolbar } from "./gradient-editor";
import {
  ImageFillEditor,
  PictureEmpty,
  pictureMeasured,
  useImageTones,
} from "./image-fill";

// ── Design context ─────────────────────────────────────────────────────────

export interface PaintDesign {
  /**
   * The design being edited (its colors and the contrast check's inputs).
   * Default: the design the editor's pickers edit (useEditableStyle).
   */
  style?: Partial<QRStyle>;
  /**
   * Colors of the theme the design started from. Default: the playground's
   * preset (none inside a style scope).
   */
  themeColors?: string[];
}

const PaintDesignContext = createContext<PaintDesign>({});

/** Overrides what the pickers below see of the design. */
export function PaintDesignProvider({
  value,
  children,
}: {
  value: PaintDesign;
  children: ReactNode;
}) {
  return (
    <PaintDesignContext.Provider value={value}>
      {children}
    </PaintDesignContext.Provider>
  );
}

/**
 * What the picker knows of the design: an explicit PaintDesignProvider's
 * values, else the editable style and the playground preset's colors.
 * `enabled: false` (colors outside a QR design) knows nothing.
 */
function usePaintDesign(enabled: boolean): PaintDesign {
  const provided = useContext(PaintDesignContext);
  const { style, scoped } = useEditableStyle();
  const themeState = useQREditorStore((state) =>
    enabled && !scoped && !provided.themeColors ? state.themeState : null,
  );
  const preset = useMemo(
    () => (themeState ? presetBaseStyles(themeState) : null),
    [themeState],
  );
  if (!enabled) return {};
  return {
    style: provided.style ?? style,
    themeColors:
      provided.themeColors ?? (preset ? designColors(preset) : undefined),
  };
}

// ── Kinds ──────────────────────────────────────────────────────────────────

export type PaintKind = "solid" | "linear" | "radial" | "angular" | "image";

/** Every color fill type a QR color takes. */
export const QR_PAINT_KINDS: PaintKind[] = [
  "solid",
  "linear",
  "radial",
  "angular",
];

/**
 * The color fills plus an image fill: for the background, the dots and the
 * eyes where the design is kept with its pictures (the playground, the
 * builder and saved themes; never links or published styles).
 */
export const QR_IMAGE_KINDS: PaintKind[] = [...QR_PAINT_KINDS, "image"];

const KIND_LABELS: Record<PaintKind, string> = {
  solid: "Solid",
  linear: "Linear",
  radial: "Radial",
  angular: "Angular",
  image: "Image",
};

/** A second color to start a gradient from `color`: hue +40°, or a tone. */
function partnerOf(color: string): string {
  const parsed = parseColorString(color);
  if (!parsed) return color;
  const hsl = rgbToHsl(parsed);
  const next =
    hsl.s < 10
      ? { ...hsl, l: hsl.l > 50 ? hsl.l - 22 : hsl.l + 22 }
      : { ...hsl, h: (hsl.h + 40) % 360 };
  return toHex(hslToRgb(next));
}

/**
 * `paint` as another color kind, keeping its stops (and angle) where it
 * can. An image fill turns into its underlay color first.
 */
function convert(
  paint: ColorConfig,
  kind: Exclude<PaintKind, "image">,
  target: string,
) {
  const given = normalizeColorConfig(paint);
  const normalized =
    given.type === "image"
      ? { type: "solid" as const, color: given.underlay ?? target }
      : given;
  if (kind === "solid") return { type: "solid" as const, color: target };
  let stops: GradientStop[];
  let angle = 0;
  if (normalized.type === "solid") {
    const partner = partnerOf(normalized.color);
    stops =
      kind === "angular"
        ? [
            { color: normalized.color, offset: 0 },
            { color: partner, offset: 50 },
            { color: normalized.color, offset: 100 },
          ]
        : [
            { color: normalized.color, offset: 0 },
            { color: partner, offset: 100 },
          ];
  } else {
    stops = normalized.stops;
    angle = normalized.type === "radial" ? 0 : (normalized.angle ?? 0);
  }
  if (kind === "radial") return { type: "radial" as const, stops };
  return { type: kind, stops, angle };
}

/**
 * A new image fill from a picture. The color it replaces becomes the
 * underlay when it suits the part (dark for the code, light for the
 * background), so the fix has something to blend toward.
 */
function newImageFill(
  src: string,
  previous: string,
  role: PaintRole | null,
): ImagePaint {
  const parsed = parseColorString(previous);
  const lum = parsed
    ? (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255
    : 0.5;
  const suits =
    role === "code" ? lum < 0.35 : role === "background" ? lum > 0.75 : true;
  return {
    type: "image",
    src,
    fit: "cover",
    scale: 1,
    position: "center",
    opacity: 1,
    ...(parsed && suits ? { underlay: toHex({ ...parsed, a: 1 }) } : {}),
  };
}

/** Every image fill's picture in a design. */
function imageSourcesOf(style: Partial<QRStyle> | undefined): string[] {
  if (!style) return [];
  const paints = [
    style.bgColor,
    style.fgColor,
    style.eyeColor,
    style.dotColor,
    ...Object.values(style.eyeColors ?? {}).flatMap((eye) => [
      eye?.outer,
      eye?.inner,
    ]),
  ];
  return paints.flatMap((item) =>
    typeof item === "object" && item?.type === "image" ? [item.src] : [],
  );
}

// ── Parsing what people paste ──────────────────────────────────────────────

let probe: CanvasRenderingContext2D | null = null;

/**
 * Any CSS color: the picker's own parser, then the browser's (oklch, lab,
 * color(), every named color) drawn on a 1×1 canvas and read back as sRGB.
 */
export function parseCssColor(text: string): RGBA | null {
  const own = parseColorString(text);
  if (own) return own;
  const value = text.trim();
  if (
    !value ||
    typeof document === "undefined" ||
    typeof CSS === "undefined" ||
    !CSS.supports("color", value)
  ) {
    return null;
  }
  try {
    if (!probe) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      probe = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!probe) return null;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = probe.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

/** Text that is clearly a color, not a number typed into a field. */
const LOOKS_LIKE_COLOR = /^\s*(#|[a-z]+\(|[a-z]{3,}\s*$)/i;

// ── Fields ─────────────────────────────────────────────────────────────────

const MODEL_KEY = "qrdx:paint:model";
const MODELS: { id: ColorModel; label: string }[] = [
  { id: "hex", label: "Hex" },
  { id: "rgb", label: "RGB" },
  { id: "hsl", label: "HSL" },
  { id: "hsb", label: "HSB" },
];

function readModel(): ColorModel {
  try {
    const stored = window.localStorage.getItem(MODEL_KEY);
    return MODELS.some((model) => model.id === stored)
      ? (stored as ColorModel)
      : "hex";
  } catch {
    return "hex";
  }
}

/** A number field: type, or arrow keys (1, 10 with Shift). */
function NumberField({
  label,
  value,
  max,
  onChange,
  suffix,
  className,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Input
        aria-label={label}
        className={cn(
          "h-8 px-1.5 text-center text-xs tabular-nums",
          suffix && "pr-3.5",
        )}
        inputMode="decimal"
        onBlur={() => setDraft(String(value))}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number.parseFloat(event.target.value);
          if (Number.isFinite(next)) onChange(clamp(next, 0, max));
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const step =
            (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
          onChange(clamp(value + step, 0, max));
        }}
        title={label}
        value={draft}
      />
      {suffix && (
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[10px]">
          {suffix}
        </span>
      )}
    </div>
  );
}

/** Hex, or any CSS color: applied as soon as it parses. */
function HexField({
  color,
  alpha,
  onColor,
}: {
  color: HSBA;
  alpha: boolean;
  onColor: (color: RGBA) => void;
}) {
  const hex = toHex(hsbToRgb(color), { alpha: false }).toUpperCase();
  const [draft, setDraft] = useState(hex);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(hex);
  }, [hex, focused]);
  return (
    <Input
      aria-label="Hex or any CSS color"
      className="h-8 min-w-0 flex-1 px-2 font-mono text-xs uppercase"
      onBlur={() => {
        setFocused(false);
        setDraft(hex);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parseCssColor(event.target.value);
        // A full value only: "#12" is still being typed
        const typed = event.target.value.trim().replace(/^#/, "");
        if (
          parsed &&
          !/^[0-9a-f]{1,2}$|^[0-9a-f]{5}$|^[0-9a-f]{7}$/i.test(typed)
        ) {
          onColor(alpha ? parsed : { ...parsed, a: color.a });
        }
      }}
      onFocus={(event) => {
        setFocused(true);
        event.currentTarget.select();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      spellCheck={false}
      title="Hex, or paste any CSS color (rgb, hsl, oklch, a name)"
      value={draft}
    />
  );
}

// ── Swatches ───────────────────────────────────────────────────────────────

type SwatchSource = "design" | "saved" | "recent" | "theme" | "suggested";
const SOURCE_KEY = "qrdx:paint:source";
const SOURCE_LABELS: Record<SwatchSource, string> = {
  design: "In this design",
  saved: "Saved",
  recent: "Recent",
  theme: "Theme",
  suggested: "Defaults",
};

function useStoredSwatches() {
  const [recent, setRecent] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    const load = () => {
      setRecent(readRecent());
      setSaved(readSaved());
    };
    load();
    window.addEventListener("qrdx:swatches", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("qrdx:swatches", load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return { recent, saved, setSaved };
}

/** Swatch buttons; arrow keys move between them, Delete removes a saved one. */
function SwatchGrid({
  colors,
  current,
  onPick,
  onRemove,
  leading,
  empty,
}: {
  colors: string[];
  current: string;
  onPick: (color: string) => void;
  onRemove?: (color: string) => void;
  leading?: ReactNode;
  empty: string;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 10,
      ArrowUp: -10,
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      buttons[clamp(index + move, 0, buttons.length - 1)]?.focus();
    }
  };
  return (
    <fieldset
      aria-label="Swatches"
      className="flex min-h-6 flex-wrap items-center gap-1.5"
      onKeyDown={onKeyDown}
    >
      {leading}
      {colors.map((color) => {
        const active = sameColor(color, current);
        return (
          <button
            aria-label={`${color.toUpperCase()}${active ? ", current" : ""}${onRemove ? ". Press Delete to remove" : ""}`}
            aria-pressed={active}
            className={cn(
              "focus-visible:ring-ring/50 rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-[3px]",
              active &&
                "ring-foreground ring-offset-background ring-2 ring-offset-1",
            )}
            key={color}
            onClick={() => onPick(color)}
            onKeyDown={(event) => {
              if (
                onRemove &&
                (event.key === "Delete" || event.key === "Backspace")
              ) {
                event.preventDefault();
                onRemove(color);
              }
            }}
            title={color.toUpperCase()}
            type="button"
          >
            <SwatchDot background={color} className="size-5" />
          </button>
        );
      })}
      {colors.length === 0 && (
        <p className="text-muted-foreground text-xs">{empty}</p>
      )}
    </fieldset>
  );
}

// ── QR safety ──────────────────────────────────────────────────────────────

function SafetyRow({
  role,
  paint,
  style,
  tones,
  onFix,
}: {
  role: PaintRole;
  paint: ColorConfig;
  style: Partial<QRStyle>;
  /** Tones of the pictures in the design, as measured so far */
  tones: ImageToneMap;
  onFix: (paint: ColorConfig) => void;
}) {
  const safety = useMemo(
    () => paintSafety(role, paint, style, tones),
    [role, paint, style, tones],
  );
  const message = safetyMessage(safety);
  const fixed = useMemo(
    () => (message ? makeScannable(role, paint, style, tones) : null),
    [message, role, paint, style, tones],
  );
  const against = role === "code" ? "on the background" : "with the code";
  // A picture being measured; one that can't be counts as its underlay
  if (isImagePaint(paint) && !tones[paint.src] && !pictureMeasured(paint.src)) {
    return (
      <p className="text-muted-foreground text-xs" aria-live="polite">
        Measuring the picture's contrast…
      </p>
    );
  }
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Contrast {against}</span>
        <span
          className={cn(
            "font-medium tabular-nums",
            message ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {safety.ratio}:1
        </span>
      </div>
      {message && (
        <div
          className="bg-muted flex min-h-9 items-center gap-2 rounded-md py-1 pr-1 pl-2 text-xs"
          title={safetyDetail(safety) ?? undefined}
        >
          <Warning2 aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {message}
            <span className="sr-only"> {safetyDetail(safety)}</span>
          </span>
          {fixed ? (
            <Button
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              onClick={() => onFix(fixed)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Magicpen className="size-3.5" />
              Make it scannable
            </Button>
          ) : (
            <span className="text-muted-foreground shrink-0 pr-1">
              {role === "code" ? "Lighten the background" : "Darken the code"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── The panel ──────────────────────────────────────────────────────────────

export interface PaintPanelProps {
  value: ColorConfig | undefined;
  onChange: (value: ColorConfig) => void;
  /** Fill types offered (default solid only) */
  kinds?: PaintKind[];
  /** Opacity controls (default true) */
  alpha?: boolean;
  /** What the color paints, for the contrast readout and suggestions */
  role?: PaintRole | null;
  /** The color shown when `value` is unset */
  fallback?: string;
  /**
   * The color belongs to the QR design (default): show its colors and the
   * contrast check. False for colors elsewhere (landing page themes).
   */
  design?: boolean;
}

/**
 * The paint picker's body: fill type, the gradient's stops and angle, the
 * color square, hue and opacity, model fields (any CSS color can be pasted
 * anywhere in it), the eyedropper where the browser has one, the QR contrast
 * readout with its fix, and swatches.
 */
export function PaintPanel({
  value,
  onChange,
  kinds = ["solid"],
  alpha = true,
  role = null,
  fallback = "#000000",
  design: inDesign = true,
}: PaintPanelProps) {
  const design = usePaintDesign(inDesign);
  const paint = normalizeColorConfig(value, fallback);
  const kind = paint.type as PaintKind;
  const stops = "stops" in paint ? paint.stops : null;
  // The Image tab before a picture is chosen, and the last picture used
  const [picking, setPicking] = useState(false);
  const lastPicture = useRef<string | null>(
    paint.type === "image" ? paint.src : null,
  );
  if (paint.type === "image") lastPicture.current = paint.src;
  const imageMode = paint.type === "image" || picking;

  const [selected, setSelected] = useState(0);
  const stopIndex = stops ? clamp(selected, 0, stops.length - 1) : 0;
  const target =
    paint.type === "solid"
      ? paint.color
      : paint.type === "image"
        ? (paint.underlay ?? fallback)
        : (paint.stops[stopIndex]?.color ?? fallback);

  // The working color: HSB keeps hue and saturation through gray and black.
  const [hsba, setHsba] = useState<HSBA>(() =>
    toHsba(parseCssColor(target) ?? { r: 0, g: 0, b: 0, a: 1 }),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync only when the target changes from outside
  useEffect(() => {
    if (sameColor(hsbaToHex(hsba), target)) return;
    const parsed = parseCssColor(target);
    if (parsed) setHsba((previous) => toHsba(parsed, previous.h));
  }, [target]);

  const [model, setModel] = useState<ColorModel>("hex");
  useEffect(() => setModel(readModel()), []);
  const chooseModel = (next: ColorModel) => {
    setModel(next);
    try {
      window.localStorage.setItem(MODEL_KEY, next);
    } catch {
      // Not persisted
    }
  };

  const [canPick, setCanPick] = useState(false);
  useEffect(() => {
    setCanPick(typeof window !== "undefined" && "EyeDropper" in window);
  }, []);

  // Handlers read the latest working color: key repeats can land before
  // the next render
  const working = useRef(hsba);
  working.current = hsba;

  const emit = (next: ColorConfig) => onChange(next);
  const colorString = (color: HSBA) =>
    toHex(hsbToRgb(alpha ? color : { ...color, a: 1 }));

  const setColor = (color: HSBA) => {
    const next = alpha ? color : { ...color, a: 1 };
    working.current = next;
    setHsba(next);
    const hex = colorString(next);
    if (stops) {
      emit({
        ...paint,
        stops: setStopColor(stops, stopIndex, hex),
      } as ColorConfig);
    } else {
      emit({ type: "solid", color: hex });
    }
  };
  const setRgba = (color: RGBA) => setColor(toHsba(color, working.current.h));

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text");
    const inField = (event.target as HTMLElement).tagName === "INPUT";
    if (inField && !LOOKS_LIKE_COLOR.test(text)) return;
    if (
      (event.target as HTMLElement)
        .getAttribute("aria-label")
        ?.startsWith("Hex")
    ) {
      return;
    }
    const parsed = parseCssColor(text);
    if (!parsed) return;
    event.preventDefault();
    setRgba(parsed);
  };

  const pickFromScreen = async () => {
    try {
      const Dropper = (
        window as unknown as {
          EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> };
        }
      ).EyeDropper;
      const result = await new Dropper().open();
      const parsed = parseColorString(result.sRGBHex);
      if (parsed) setRgba({ ...parsed, a: hsba.a });
    } catch {
      // Cancelled (Escape)
    }
  };

  const { recent, saved, setSaved } = useStoredSwatches();
  const [source, setSource] = useState<SwatchSource>("design");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOURCE_KEY);
      if (stored && stored in SOURCE_LABELS) setSource(stored as SwatchSource);
    } catch {
      // Default source
    }
  }, []);
  const chooseSource = (next: SwatchSource) => {
    setSource(next);
    try {
      window.localStorage.setItem(SOURCE_KEY, next);
    } catch {
      // Not persisted
    }
  };
  const designSwatches = design.style ? designColors(design.style) : [];
  const theme = (design.themeColors ?? [])
    .map((color) => swatchHex(color))
    .filter((color): color is string => Boolean(color));
  const sources = (Object.keys(SOURCE_LABELS) as SwatchSource[]).filter(
    (id) =>
      (id !== "design" || design.style) && (id !== "theme" || theme.length > 0),
  );
  const activeSource = sources.includes(source) ? source : "saved";
  const currentHex = colorString(hsba);
  const isSaved = saved.includes(swatchHex(currentHex) ?? "");
  const swatches: Record<SwatchSource, string[]> = {
    design: designSwatches,
    saved,
    recent,
    theme: [...new Set(theme)],
    suggested: DEFAULT_SWATCHES[role ?? "any"],
  };
  const pickSwatch = (color: string) => {
    const parsed = parseColorString(color);
    if (parsed) setRgba(alpha ? parsed : { ...parsed, a: 1 });
  };

  const rgb = hsbToRgb({ ...hsba, a: 1 });
  const opaqueHex = toHex(rgb);
  const channels = model === "hex" ? null : channelsOf(hsba, model);
  const tones = useImageTones(
    [
      ...imageSourcesOf(design.style),
      ...(paint.type === "image" ? [paint.src] : []),
    ].filter((src, index, list) => list.indexOf(src) === index),
  );

  return (
    <div className="space-y-3" onPaste={onPaste}>
      {kinds.length > 1 && (
        <ToggleGroup
          aria-label="Fill type"
          className="bg-muted grid w-full gap-0 rounded-lg p-0.5"
          onValueChange={(item) => {
            if (!item || (item === kind && !picking)) return;
            setSelected(0);
            if (item === "image") {
              // The last picture comes back; otherwise pick one first
              if (lastPicture.current) {
                setPicking(false);
                emit(newImageFill(lastPicture.current, target, role));
              } else {
                setPicking(true);
              }
              return;
            }
            setPicking(false);
            if (item === kind) return;
            emit(
              convert(
                paint,
                item as Exclude<PaintKind, "image">,
                target,
              ) as ColorConfig,
            );
          }}
          style={{
            gridTemplateColumns: `repeat(${kinds.length}, minmax(0, 1fr))`,
          }}
          type="single"
          value={imageMode ? "image" : kind}
        >
          {kinds.map((item) => (
            <ToggleGroupItem
              className="text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground dark:data-[state=on]:bg-input/40 h-7 min-w-0 rounded-md px-1 text-xs font-medium hover:bg-transparent data-[state=on]:shadow-sm"
              key={item}
              value={item}
            >
              {KIND_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {picking && paint.type !== "image" && (
        <PictureEmpty
          onPicture={(src) => {
            lastPicture.current = src;
            setPicking(false);
            emit(newImageFill(src, target, role));
          }}
        />
      )}

      {paint.type === "image" && (
        <ImageFillEditor onChange={(next) => emit(next)} paint={paint} />
      )}

      {!imageMode && (
        <>
          {stops && (
            <div className="space-y-2" data-vaul-no-drag="">
              <GradientBar
                onChange={(next, index) => {
                  setSelected(index);
                  emit({ ...paint, stops: next } as ColorConfig);
                }}
                onSelect={setSelected}
                selected={stopIndex}
                stops={stops}
              />
              <GradientToolbar
                angle={
                  paint.type === "linear" || paint.type === "angular"
                    ? Math.round(paint.angle ?? 0)
                    : 0
                }
                canRemove={stops.length > MIN_STOPS}
                fromTop={kind === "angular"}
                hasAngle={kind !== "radial"}
                onAngle={(angle) => emit({ ...paint, angle } as ColorConfig)}
                onRemove={() => {
                  const removed = removeStop(stops, stopIndex);
                  if (!removed) return;
                  setSelected(removed.index);
                  emit({ ...paint, stops: removed.stops } as ColorConfig);
                }}
                onReverse={() => {
                  const reversed = reverseStops(stops);
                  const before = normalizeStops(stops).length - 1;
                  setSelected(clamp(before - stopIndex, 0, before));
                  emit({ ...paint, stops: reversed } as ColorConfig);
                }}
              />
            </div>
          )}

          <div className="space-y-2.5" data-vaul-no-drag="">
            <ColorArea color={hsba} onChange={setColor} />
            <div className="flex items-center gap-2">
              {canPick && (
                <Button
                  aria-label="Pick a color from the screen"
                  className="size-8 shrink-0"
                  onClick={pickFromScreen}
                  size="icon"
                  title="Pick from the screen"
                  type="button"
                  variant="ghost"
                >
                  <Pipette className="size-4" />
                </Button>
              )}
              <div className="min-w-0 flex-1 space-y-2.5 px-1.5">
                <ChannelSlider
                  background={HUE_TRACK}
                  label="Hue"
                  max={360}
                  onChange={(h) => setColor({ ...working.current, h })}
                  thumbColor={toHex(
                    hsbToRgb({ h: hsba.h, s: 100, b: 100, a: 1 }),
                  )}
                  value={hsba.h}
                  valueText={`${round(hsba.h)}°`}
                />
                {alpha && (
                  <ChannelSlider
                    background={`linear-gradient(to right, ${opaqueHex}00, ${opaqueHex})`}
                    checker
                    label="Opacity"
                    max={100}
                    onChange={(a) =>
                      setColor({ ...working.current, a: a / 100 })
                    }
                    thumbColor={opaqueHex}
                    value={hsba.a * 100}
                    valueText={`${round(hsba.a * 100)}%`}
                  />
                )}
              </div>
              <span
                aria-hidden="true"
                className="relative size-8 shrink-0 overflow-hidden rounded-md"
                style={CHECKER_STYLE}
              >
                <span
                  className="absolute inset-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
                  style={{ background: currentHex }}
                />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              onValueChange={(next) => chooseModel(next as ColorModel)}
              value={model}
            >
              <SelectTrigger
                aria-label="Color model"
                className="h-8 w-[4.25rem] shrink-0 px-2 text-xs"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              {/* Above the picker (z-[130]) */}
              <SelectContent className="z-[140]">
                {MODELS.map((item) => (
                  <SelectItem className="text-xs" key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {model === "hex" ? (
              <HexField alpha={alpha} color={hsba} onColor={setRgba} />
            ) : (
              MODEL_CHANNELS[model].map((spec) => (
                <NumberField
                  key={spec.key}
                  label={spec.label}
                  max={spec.max}
                  onChange={(next) =>
                    setColor(withChannel(hsba, model, spec.key, next))
                  }
                  value={channels?.[spec.key] ?? 0}
                />
              ))
            )}
            {alpha && (
              <NumberField
                className="max-w-[3.25rem]"
                label="Opacity, percent"
                max={100}
                onChange={(next) =>
                  setColor({ ...working.current, a: next / 100 })
                }
                suffix="%"
                value={round(hsba.a * 100)}
              />
            )}
          </div>
        </>
      )}

      {role && design.style && !(picking && paint.type !== "image") && (
        <SafetyRow
          onFix={(fixed) => {
            emit(fixed);
            const next = normalizeColorConfig(fixed);
            const color =
              next.type === "solid"
                ? next.color
                : next.type === "image"
                  ? undefined
                  : next.stops[stopIndex]?.color;
            const parsed = color ? parseColorString(color) : null;
            if (parsed) setHsba((previous) => toHsba(parsed, previous.h));
          }}
          paint={paint}
          role={role}
          style={design.style}
          tones={tones}
        />
      )}

      {!imageMode && (
        <div className="space-y-2">
          <div
            aria-label="Swatches"
            className="text-muted-foreground -mx-1 flex flex-nowrap gap-x-0.5 overflow-x-auto text-[11px] whitespace-nowrap [scrollbar-width:none]"
            role="tablist"
          >
            {sources.map((id) => (
              <button
                aria-selected={id === activeSource}
                className={cn(
                  "focus-visible:ring-ring/50 rounded px-1 py-0.5 outline-none focus-visible:ring-[3px]",
                  id === activeSource
                    ? "text-foreground font-medium"
                    : "hover:text-foreground",
                )}
                key={id}
                onClick={() => chooseSource(id)}
                role="tab"
                type="button"
              >
                {SOURCE_LABELS[id]}
              </button>
            ))}
          </div>
          <SwatchGrid
            colors={swatches[activeSource]}
            current={currentHex}
            empty={
              activeSource === "saved"
                ? "Save colors to use them again."
                : activeSource === "recent"
                  ? "Colors you pick show up here."
                  : "No colors yet."
            }
            leading={
              activeSource === "saved" ? (
                <Button
                  aria-label={
                    isSaved ? "Remove this color from saved" : "Save this color"
                  }
                  aria-pressed={isSaved}
                  className="size-6 rounded-full"
                  onClick={() => setSaved(toggleSaved(currentHex))}
                  size="icon"
                  title={isSaved ? "Saved: click to remove" : "Save this color"}
                  type="button"
                  variant="outline"
                >
                  <Bookmark
                    className="size-3"
                    variant={isSaved ? "Bold" : "Linear"}
                  />
                </Button>
              ) : undefined
            }
            onPick={pickSwatch}
            onRemove={
              activeSource === "saved"
                ? (color) => setSaved(removeSaved(color))
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

/** Short text for a paint: its hex (and opacity), or the gradient's kind. */
export function paintSummary(value: ColorConfig | undefined, fallback: string) {
  const paint = normalizeColorConfig(value, fallback);
  if (paint.type === "solid") {
    const parsed = parseCssColor(paint.color);
    if (!parsed) return paint.color;
    const hex = toHex(parsed, { alpha: false }).toUpperCase();
    return parsed.a < 1 ? `${hex} · ${round(parsed.a * 100)}%` : hex;
  }
  if (paint.type === "image") {
    const opacity = paint.opacity ?? 1;
    return opacity < 1 ? `Image · ${round(opacity * 100)}%` : "Image";
  }
  const label = KIND_LABELS[paint.type as PaintKind];
  return paint.type === "radial"
    ? label
    : `${label} ${Math.round(paint.angle ?? 0)}°`;
}

/** CSS background for a trigger swatch. */
export const paintBackground = (
  value: ColorConfig | undefined,
  fallback: string,
) => getNormalizedColor(value ?? fallback);

export { SAVED_KEY };
