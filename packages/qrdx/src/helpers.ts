import type { ImageSettings, LogoOptions, QRProps } from "../types";
import { LOGO_SIZE_DEFAULT } from "../types/qr";
import qrcodegen from "./codegen";
import { DEFAULT_LEVEL, DEFAULT_MARGIN, ERROR_LEVEL_MAP } from "./constants";
import { getLayoutMargin } from "./qr-shape";
import { resolveErrorLevel } from "./utils";

interface QRDataProps extends QRProps {
  hideLogo?: boolean;
  logo?: string;
  /**
   * Size, clear space and position of `logo` (see `LogoOptions`). Without
   * it the logo is 25% wide and centered, as before.
   */
  logoOptions?: LogoOptions;
}

interface QRDataResult extends QRProps {
  size: number; // Required in result
}

/** Modules across the symbol (no margin) for `value` at `level`. */
function symbolModules(value: string, level: QRProps["level"]): number {
  return qrcodegen.QrCode.encodeText(
    value,
    ERROR_LEVEL_MAP[level ?? DEFAULT_LEVEL]
  ).size;
}

/**
 * `imageSettings` (pixels of a `size`-wide code) for a logo laid out with
 * `options`. Clear space is in modules and the position is across the
 * symbol, so both need the module count at the level the code is drawn at.
 */
function logoImageSettings(
  src: string,
  options: LogoOptions | undefined,
  code: {
    value: string;
    size: number;
    margin: number;
    level?: QRProps["level"];
    shape?: QRProps["shape"];
  }
): ImageSettings {
  const width = code.size * (options?.size ?? LOGO_SIZE_DEFAULT);
  const settings: ImageSettings = {
    src,
    width,
    height: width,
    excavate: true,
    ...(options?.shape &&
      options.shape !== "square" && { shape: options.shape }),
    ...(options?.plate && { plate: options.plate }),
  };
  const positioned = options?.x !== undefined || options?.y !== undefined;
  if (!(options?.padding || positioned)) {
    return settings;
  }
  const modules = symbolModules(code.value, code.level);
  // A circle code draws its symbol further in (see qr-shape.ts)
  const margin = getLayoutMargin(modules, code.margin, code.shape);
  const modulePx = code.size / (modules + 2 * margin);
  if (options.padding) {
    settings.padding = options.padding * modulePx;
  }
  if (positioned) {
    // Center across the symbol, kept inside it
    const symbolPx = modules * modulePx;
    const place = (share: number | undefined) =>
      Math.min(
        Math.max((share ?? 0.5) * symbolPx - width / 2, 0),
        symbolPx - width
      );
    settings.x = place(options.x);
    settings.y = place(options.y);
  }
  return settings;
}

export function getQRData({
  value,
  size = 1024,
  fgColor,
  bgColor,
  eyeColor,
  dotColor,
  bodyPattern,
  hideLogo,
  logo,
  logoOptions,
  margin,
  cornerEyePattern,
  cornerEyeDotPattern,
  level,
  templateId,
  frame,
  eyeColors,
  moduleScale,
  autoLevel,
  shape,
}: QRDataProps): QRDataResult {
  const code = {
    value: `${value}`,
    size,
    margin: margin ?? DEFAULT_MARGIN,
    level,
    shape,
  };
  // No default logo: only render (and excavate for) one the caller passes.
  let imageSettings =
    !hideLogo && logo ? logoImageSettings(logo, logoOptions, code) : undefined;
  // autoLevel can raise the level (more modules): lay the logo out again at
  // the level it will be drawn at, so clear space stays in whole modules.
  if (imageSettings && logo && autoLevel) {
    const drawn = resolveErrorLevel({ ...code, imageSettings, autoLevel });
    if (drawn !== (level ?? DEFAULT_LEVEL)) {
      imageSettings = logoImageSettings(logo, logoOptions, {
        ...code,
        level: drawn,
      });
    }
  }
  return {
    value: code.value,
    bgColor,
    fgColor,
    eyeColor,
    dotColor,
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    level,
    templateId,
    size,
    margin,
    ...(frame && { frame }),
    ...(eyeColors && { eyeColors }),
    ...(moduleScale !== undefined && { moduleScale }),
    ...(autoLevel && { autoLevel }),
    ...(shape && shape !== "square" && { shape }),
    ...(imageSettings && { imageSettings }),
  };
}
