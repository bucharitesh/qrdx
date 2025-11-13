import type { ErrorLevel } from "../types";
import qrcodegen from "./codegen";

/**
 * Mapping of error correction levels to qrcodegen.QrCode.Ecc values
 */
export const ERROR_LEVEL_MAP: Record<ErrorLevel, qrcodegen.QrCode.Ecc> = {
  L: qrcodegen.QrCode.Ecc.LOW,
  M: qrcodegen.QrCode.Ecc.MEDIUM,
  Q: qrcodegen.QrCode.Ecc.QUARTILE,
  H: qrcodegen.QrCode.Ecc.HIGH,
};

/**
 * Default QR code size in pixels
 */
export const DEFAULT_SIZE = 128;

/**
 * Default error correction level
 */
export const DEFAULT_LEVEL: ErrorLevel = "Q";

/**
 * Default background color
 */
export const DEFAULT_BGCOLOR = "#FFFFFF";

/**
 * Default foreground color
 */
export const DEFAULT_FGCOLOR = "#000000";

/**
 * Default eye color
 */
export const DEFAULT_EYECOLOR = "#000000";

/**
 * Default dot color
 */
export const DEFAULT_DOTCOLOR = "#000000";

/**
 * Default margin around the QR code
 */
export const DEFAULT_MARGIN = 0;

/**
 * Available QR error correction levels
 */
export const QR_LEVELS: readonly ErrorLevel[] = ["L", "M", "Q", "H"] as const;

/**
 * This is *very* rough estimate of max amount of QRCode allowed to be covered.
 * It is "wrong" in a lot of ways (area is a terrible way to estimate, it
 * really should be number of modules covered), but if for some reason we don't
 * get an explicit height or width, I'd rather default to something than throw.
 */
export const DEFAULT_IMG_SCALE = 0.1;

/**
 * Default logo URL for QR codes
 */
export const FLAM_QR_LOGO = "https://instant.flamapp.ai/flogo-qr.svg";
