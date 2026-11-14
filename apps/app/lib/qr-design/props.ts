import { getQRData, type QRProps } from "qrdx";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { ThemeStyles } from "@/types/theme";

/**
 * The QR props the editor renders and scores for `value` in `style`: the
 * same mapping as the "Scan score" badge (components/editor/scan-score.tsx)
 * and the preview, so a server-side score checks what the user will see.
 * `logo` is the image drawn when the style shows one.
 */
export function designQRProps(
  value: string,
  style: ThemeStyles,
  logo: string | undefined,
): QRProps {
  return {
    ...getQRData({
      value,
      fgColor: style.fgColor,
      bgColor: style.bgColor,
      eyeColor: style.eyeColor,
      dotColor: style.dotColor,
      bodyPattern: style.bodyPattern,
      hideLogo: !style.showLogo,
      logo,
      level: style.level,
      margin: style.margin,
      ...styleEngineOptions(style),
    }),
    level: style.level,
    cornerEyePattern: style.cornerEyePattern,
    cornerEyeDotPattern: style.cornerEyeDotPattern,
    templateId: style.templateId,
    frame: style.frame,
    margin: style.margin,
    art: style.art,
  };
}
