import type { ErrorLevel, ImageSettings, LogoOptions, QRProps } from "../types";
import { LOGO_SIZE_DEFAULT, LOGO_SIZE_MAX } from "../types/constants";
import qrcodegen from "./codegen";
import { DEFAULT_LEVEL, DEFAULT_MARGIN, ERROR_LEVEL_MAP } from "./constants";
import { fitLogoWidth } from "./logo-budget";
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
  },
  width = code.size * (options?.size ?? LOGO_SIZE_DEFAULT)
): ImageSettings {
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

/**
 * The logo's imageSettings, no bigger than the code's error correction can
 * repair (logo-budget.ts): the requested size when it fits, else the
 * largest that does, or none when not even a sliver fits.
 */
function capLogo(
  src: string,
  options: LogoOptions | undefined,
  code: {
    value: string;
    size: number;
    margin: number;
    level?: QRProps["level"];
    shape?: QRProps["shape"];
  },
  autoLevel: boolean | undefined
): ImageSettings | undefined {
  const requested = code.level ?? DEFAULT_LEVEL;
  let drawn = requested;
  // autoLevel can raise the level (more modules): lay the logo out at the
  // level it will be drawn at, so clear space stays in whole modules.
  if (autoLevel) {
    drawn = resolveErrorLevel({
      ...code,
      imageSettings: logoImageSettings(src, options, code),
      autoLevel,
    });
  }
  const fitAt = (level: ErrorLevel) => {
    const layout = (width?: number) =>
      logoImageSettings(src, options, { ...code, level }, width);
    const width = fitLogoWidth(code, [level], layout().width, layout);
    return width > 0 ? layout(width) : undefined;
  };
  if (drawn === requested) {
    return fitAt(requested);
  }
  // autoLevel draws at H only while the logo covers more than 7%: keep the
  // H-sized logo when it still does, else size it for the requested level
  const atH = fitAt(drawn);
  if (
    atH &&
    resolveErrorLevel({ ...code, imageSettings: atH, autoLevel }) === drawn
  ) {
    return atH;
  }
  return fitAt(requested);
}

/**
 * The largest logo `size` (share of the code's width, up to LOGO_SIZE_MAX)
 * that fits this code's error correction with `options`' clear space and
 * position, so the editor can cap its slider. 0 when no logo fits.
 */
export function getLogoSizeLimit({
  value,
  level,
  margin,
  shape,
  autoLevel,
  logoOptions,
}: Pick<QRProps, "value" | "level" | "margin" | "shape" | "autoLevel"> & {
  logoOptions?: LogoOptions;
}): number {
  const size = 1024;
  const settings = capLogo(
    "data:,",
    { ...logoOptions, size: LOGO_SIZE_MAX },
    { value: `${value}`, size, margin: margin ?? DEFAULT_MARGIN, level, shape },
    autoLevel
  );
  return settings ? settings.width / size : 0;
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
  const imageSettings =
    !hideLogo && logo ? capLogo(logo, logoOptions, code, autoLevel) : undefined;
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
