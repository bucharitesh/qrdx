import type { CSSProperties } from "react";
import type { LandingTheme } from "@/types/landing";

// Theme → CSS for hosted pages. Server-safe (no hooks); used by the /p
// renderer and the editor's live preview. Blocks style themselves with the
// `--lp-*` custom properties set here.

export const LANDING_FONTS = [
  {
    id: "system",
    label: "System",
    stack:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "geist",
    label: "Geist",
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "rounded",
    label: "Rounded",
    stack:
      'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif',
  },
  {
    id: "humanist",
    label: "Humanist",
    stack:
      'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack:
      'ui-serif, Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  },
  {
    id: "mono",
    label: "Monospace",
    stack:
      'var(--font-geist-mono), ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
  },
  // Web fonts (components/landing/fonts.ts): loaded only by pages that use them.
  // `heading` tunes weight and tracking when the font sets headings.
  {
    id: "dm-sans",
    label: "DM Sans",
    stack: "var(--font-lp-dm-sans), ui-sans-serif, system-ui, sans-serif",
    heading: { weight: 700, tracking: "-0.03em" },
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    stack: "var(--font-lp-space-grotesk), ui-sans-serif, system-ui, sans-serif",
    heading: { weight: 600, tracking: "-0.035em" },
  },
  {
    id: "bricolage",
    label: "Bricolage Grotesque",
    stack: "var(--font-lp-bricolage), ui-sans-serif, system-ui, sans-serif",
    heading: { weight: 700, tracking: "-0.04em" },
  },
  {
    id: "fraunces",
    label: "Fraunces",
    stack: "var(--font-lp-fraunces), ui-serif, Georgia, serif",
    heading: { weight: 600, tracking: "-0.02em" },
  },
  {
    id: "instrument-serif",
    label: "Instrument Serif",
    stack: "var(--font-lp-instrument-serif), ui-serif, Georgia, serif",
    heading: { weight: 400, tracking: "-0.01em" },
  },
  {
    id: "cormorant",
    label: "Cormorant",
    stack: "var(--font-lp-cormorant), ui-serif, Georgia, serif",
    heading: { weight: 600, tracking: "0em" },
  },
] as const;

export type LandingFontId = (typeof LANDING_FONTS)[number]["id"];

type LandingFont = (typeof LANDING_FONTS)[number];

function findFont(id: string): LandingFont | undefined {
  return LANDING_FONTS.find((font) => font.id === id);
}

export function fontStack(id: string): string {
  return findFont(id)?.stack ?? LANDING_FONTS[0].stack;
}

/** Weight and tracking for headings set in `id` (bold and tight by default). */
export function headingStyle(id: string): { weight: number; tracking: string } {
  const font = findFont(id);
  return font && "heading" in font
    ? font.heading
    : { weight: 700, tracking: "-0.025em" };
}

/** `url("…")` for a validated http(s) URL (quotes and backslashes escaped). */
export function cssUrl(value: string): string {
  let href = value;
  try {
    href = new URL(value).href;
  } catch {
    return "none";
  }
  return `url("${href.replace(/["\\\n\r]/g, (char) => encodeURIComponent(char))}")`;
}

function baseBackground(theme: LandingTheme): CSSProperties {
  const { background, colors } = theme;
  switch (background.type) {
    case "gradient":
      return {
        backgroundColor: colors.background,
        backgroundImage:
          background.shape === "radial"
            ? `radial-gradient(130% 75% at 50% 0%, ${background.from}, ${background.to})`
            : `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
      };
    case "image": {
      const shade = `rgba(0, 0, 0, ${background.overlay})`;
      return {
        backgroundColor: colors.background,
        backgroundImage: `linear-gradient(${shade}, ${shade}), ${cssUrl(background.url)}`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "scroll",
      };
    }
    default:
      return { backgroundColor: colors.background };
  }
}

const svgUrl = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}")`;

/** A repeating pattern tile in the text color: [image, tile size]. */
function textureLayer(
  texture: NonNullable<LandingTheme["texture"]>,
  foreground: string,
  dark: boolean,
): [string, string] {
  const ink = rgbToHex(hexToRgb(foreground));
  switch (texture) {
    case "dots":
      return [
        svgUrl(
          `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='2' cy='2' r='1' fill='${ink}' fill-opacity='${dark ? 0.22 : 0.16}'/></svg>`,
        ),
        "22px 22px",
      ];
    case "grid":
      return [
        svgUrl(
          `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><path d='M32 .5H.5V32' fill='none' stroke='${ink}' stroke-opacity='${dark ? 0.09 : 0.07}'/></svg>`,
        ),
        "32px 32px",
      ];
    default:
      return [
        svgUrl(
          `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='${dark ? 0.09 : 0.06}'/></svg>`,
        ),
        "180px 180px",
      ];
  }
}

export function backgroundStyle(theme: LandingTheme): CSSProperties {
  const style = baseBackground(theme);
  if (!theme.texture) return style;
  // The pattern is the top layer; the background's own layers keep their sizing.
  const [image, size] = textureLayer(
    theme.texture,
    theme.colors.foreground,
    luminance(theme.colors.background) < 0.35,
  );
  const layers = style.backgroundImage
    ? String(style.backgroundImage).split(/,(?![^(]*\))/).length
    : 0;
  const repeat = (value: string | undefined, fallback: string) =>
    Array(layers).fill(value ?? fallback);
  return {
    ...style,
    backgroundImage: [image, style.backgroundImage].filter(Boolean).join(", "),
    backgroundSize: [
      size,
      ...repeat(style.backgroundSize as string, "auto"),
    ].join(", "),
    backgroundPosition: [
      "0 0",
      ...repeat(style.backgroundPosition as string, "0 0"),
    ].join(", "),
    backgroundRepeat: [
      "repeat",
      ...repeat(
        undefined,
        layers && style.backgroundSize ? "no-repeat" : "repeat",
      ),
    ].join(", "),
  };
}

/** Custom properties every block reads (`var(--lp-primary)`, ...). */
export function themeVariables(theme: LandingTheme): CSSProperties {
  const { colors } = theme;
  return {
    "--lp-bg": colors.background,
    "--lp-fg": colors.foreground,
    "--lp-primary": colors.primary,
    "--lp-primary-fg": colors.primaryForeground,
    "--lp-muted": colors.muted,
    "--lp-muted-fg": colors.mutedForeground,
    "--lp-radius": `${theme.radius}px`,
    "--lp-font": fontStack(theme.font),
    color: colors.foreground,
    fontFamily: fontStack(theme.font),
    ...(theme.headingFont && headingVariables(theme.headingFont)),
  } as CSSProperties;
}

function headingVariables(id: string) {
  const { weight, tracking } = headingStyle(id);
  return {
    "--lp-heading-font": fontStack(id),
    "--lp-heading-weight": String(weight),
    "--lp-heading-tracking": tracking,
  };
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

/** #rgb / #rgba / #rrggbb / #rrggbbaa → [r, g, b] (alpha ignored). */
export function hexToRgb(hex: string): [number, number, number] {
  let value = hex.trim().replace("#", "");
  if (value.length === 3 || value.length === 4) {
    value = [...value.slice(0, 3)].map((char) => char + char).join("");
  }
  const int = Number.parseInt(value.slice(0, 6), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** WCAG relative luminance (0–1). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** `amount` (0–1) of the way from `from` to `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

/** Black or white, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#ffffff") >=
    contrastRatio(background, "#0a0a0a")
    ? "#ffffff"
    : "#0a0a0a";
}

/**
 * A full page palette from a background and an accent color: text, muted
 * surfaces and text-on-accent are derived for legible contrast.
 */
export function paletteFrom(
  background: string,
  primary: string,
): LandingTheme["colors"] {
  const bg = rgbToHex(hexToRgb(background));
  const accent = rgbToHex(hexToRgb(primary));
  const foreground = readableOn(bg) === "#ffffff" ? "#fafafa" : "#0a0a0a";
  return {
    background: bg,
    foreground,
    primary: accent,
    primaryForeground: readableOn(accent),
    muted: mixColors(bg, foreground, 0.06),
    mutedForeground: mixColors(bg, foreground, 0.62),
  };
}

export interface ThemePreset {
  id: string;
  name: string;
  colors: LandingTheme["colors"];
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "classic", name: "Classic", colors: paletteFrom("#ffffff", "#155dfc") },
  {
    id: "midnight",
    name: "Midnight",
    colors: paletteFrom("#0b1020", "#7c9cff"),
  },
  { id: "sand", name: "Sand", colors: paletteFrom("#f7f1e8", "#9a3412") },
  { id: "forest", name: "Forest", colors: paletteFrom("#f1f7f2", "#166534") },
  { id: "berry", name: "Berry", colors: paletteFrom("#fff5f7", "#be185d") },
  { id: "ocean", name: "Ocean", colors: paletteFrom("#effaff", "#0369a1") },
  {
    id: "graphite",
    name: "Graphite",
    colors: paletteFrom("#18181b", "#fafafa"),
  },
  { id: "sunset", name: "Sunset", colors: paletteFrom("#fff7ed", "#ea580c") },
];

export function themePreset(id: string): LandingTheme["colors"] {
  return structuredClone(
    (THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0])
      .colors,
  );
}

type QrColor =
  | string
  | { type: "solid"; color: string }
  | { type: "linear" | "radial"; stops: { color: string }[] }
  | undefined;

function firstHex(color: QrColor): string | null {
  if (!color) return null;
  if (typeof color === "string") return isHexColor(color) ? color : null;
  if (color.type === "solid")
    return isHexColor(color.color) ? color.color : null;
  const stop = color.stops.find((s) => isHexColor(s.color));
  return stop ? stop.color : null;
}

/**
 * Page palette from a saved QR theme (qr_preset.style): the QR background
 * becomes the page background and the dots color the accent. Null when the
 * theme has no usable hex colors.
 */
export function paletteFromQrStyle(style: {
  bgColor?: QrColor;
  fgColor?: QrColor;
  eyeColor?: QrColor;
}): LandingTheme["colors"] | null {
  const fg = firstHex(style.fgColor) ?? firstHex(style.eyeColor);
  if (!fg) return null;
  const bg = firstHex(style.bgColor) ?? "#ffffff";
  // A QR on a dark background reads best with a light accent and vice versa.
  if (contrastRatio(bg, fg) < 1.5) return paletteFrom(bg, readableOn(bg));
  return paletteFrom(bg, fg);
}
