import z from "zod";
import { themeStylePropsSchema } from "@/types/theme";

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe("Solid colour as #RRGGBB");

// What the AI returns. The four colours and three patterns are required: with
// an all-optional schema the model kept dropping eyeColor/dotColor, so a
// "matching eyes" request left the old eyes on screen while the reply claimed
// otherwise. templateId, frame, art and level stay manual-only.
export const themeStylePropsOutputSchema = themeStylePropsSchema
  .pick({
    size: true,
    margin: true,
    showLogo: true,
    bodyPattern: true,
    cornerEyePattern: true,
    cornerEyeDotPattern: true,
  })
  .partial()
  .required({
    bodyPattern: true,
    cornerEyePattern: true,
    cornerEyeDotPattern: true,
  })
  .extend({
    bgColor: hex.describe("Background colour, #RRGGBB"),
    fgColor: hex.describe("Colour of the QR modules (dots), #RRGGBB"),
    eyeColor: hex.describe("Colour of the three corner eye frames, #RRGGBB"),
    dotColor: hex.describe("Colour of the corner eye centres, #RRGGBB"),
  });

export type GeneratedThemeStyles = z.infer<typeof themeStylePropsOutputSchema>;

/**
 * Minimum contrast against the background: data modules need the most; the
 * large solid finder eyes still read at 3:1, which leaves room for accents.
 */
const MIN_CONTRAST = { module: 4.5, eye: 3 } as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(color: string) {
  const channels = [1, 3, 5].map((i) => {
    const c = Number.parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(color: string, target: string, amount: number) {
  const channel = (hex: string, i: number) =>
    Number.parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(channel(color, i) * (1 - amount) + channel(target, i) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

/**
 * Keeps the colour the model chose but darkens it (light backgrounds) or
 * lightens it (dark backgrounds) just enough to scan, so a gold accent stays
 * gold instead of becoming black. On mid-grey backgrounds where neither
 * direction gets there, falls back to pure black.
 */
function readable(color: string, bgColor: string, min: number) {
  if (contrastRatio(color, bgColor) >= min) return color;
  const target = luminance(bgColor) > 0.18 ? "#000000" : "#FFFFFF";
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, target, step / 20);
    if (contrastRatio(candidate, bgColor) >= min) return candidate;
  }
  return "#000000";
}

/**
 * Applied to the final theme and to every streamed partial, so what the
 * preview shows while generating matches what Apply sets.
 */
export function ensureScannable<T extends Partial<GeneratedThemeStyles>>(
  styles: T,
): T {
  const { bgColor } = styles;
  if (!bgColor || !HEX.test(bgColor)) return styles;
  const fix = (color: string | undefined, min: number) =>
    color && HEX.test(color) ? readable(color, bgColor, min) : color;
  return {
    ...styles,
    fgColor: fix(styles.fgColor, MIN_CONTRAST.module),
    eyeColor: fix(styles.eyeColor, MIN_CONTRAST.eye),
    dotColor: fix(styles.dotColor, MIN_CONTRAST.eye),
  };
}
