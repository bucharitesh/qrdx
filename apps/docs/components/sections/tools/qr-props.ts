import { getQRData, type QRProps } from "qrdx";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import type { ThemeStyles } from "@/types/theme";

/** Blank border the QR spec asks for around the code, in modules. */
export const QUIET_ZONE_MODULES = 4;

interface BuildOptions {
  quietZone: boolean;
  /** Overrides the style's logo (e.g. a pre-converted data URI). */
  logo?: string;
}

/** Same prop mapping the editor's download dialog uses, plus an optional quiet zone. */
export function buildQrProps(
  value: string,
  styles: ThemeStyles,
  { quietZone, logo }: BuildOptions,
): QRProps {
  return getQRData({
    value,
    fgColor: styles.fgColor,
    bgColor: styles.bgColor,
    eyeColor: styles.eyeColor,
    dotColor: styles.dotColor,
    bodyPattern: styles.bodyPattern,
    cornerEyePattern: styles.cornerEyePattern,
    cornerEyeDotPattern: styles.cornerEyeDotPattern,
    level: styles.level,
    templateId: styles.templateId,
    hideLogo: !styles.showLogo,
    logo: logo ?? styles.customLogo ?? DEFAULT_QR_LOGO,
    margin: quietZone ? QUIET_ZONE_MODULES : (styles.margin ?? 0),
  });
}
