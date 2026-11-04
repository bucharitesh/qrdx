import type { EyeColors, LogoOptions, QRShape } from "qrdx/types";
import type { ThemeStyles } from "@/types/theme";

/** Engine options a style can carry beyond colors, shapes and the frame. */
export interface StyleEngineOptions {
  eyeColors?: EyeColors;
  moduleScale?: number;
  autoLevel?: boolean;
  logoOptions?: LogoOptions;
  shape?: QRShape;
}

/**
 * Per-eye colors, module size, auto error correction and the logo layout of
 * `style`, ready to spread into `getQRData(...)` or `<QRCode>`. Only set
 * values are returned, so a style without them renders exactly as before.
 * Pass `level` and `margin` to `getQRData` too: logo clear space and
 * position are laid out in modules.
 */
export function styleEngineOptions(
  style: Partial<ThemeStyles>,
): StyleEngineOptions {
  const eyeColors = style.eyeColors;
  const hasEyeColors =
    eyeColors !== undefined &&
    Object.values(eyeColors).some((eye) => eye?.outer || eye?.inner);
  return {
    ...(hasEyeColors && { eyeColors }),
    ...(style.moduleScale !== undefined &&
      style.moduleScale < 1 && { moduleScale: style.moduleScale }),
    ...(style.autoLevel && { autoLevel: true }),
    ...(style.logoOptions &&
      Object.keys(style.logoOptions).length > 0 && {
        logoOptions: style.logoOptions,
      }),
    ...(style.shape === "circle" && { shape: "circle" as const }),
  };
}

/**
 * The options `<QRCodeSVG>` takes directly (per-eye colors, module size
 * and the circle shape), for previews without a logo. Logo layout goes through `getQRData`.
 */
export function styleSvgOptions(
  style: Partial<ThemeStyles>,
): Pick<StyleEngineOptions, "eyeColors" | "moduleScale" | "shape"> {
  const { eyeColors, moduleScale, shape } = styleEngineOptions(style);
  return {
    ...(eyeColors && { eyeColors }),
    ...(moduleScale !== undefined && { moduleScale }),
    ...(shape && { shape }),
  };
}
