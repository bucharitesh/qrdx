import { getQRData, type QRCodeProps, type QRProps } from "qrdx";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { ThemeStyles } from "@/types/theme";

/**
 * The `<QRCode>` props the editor's preview (components/qr-preview-panel.tsx)
 * draws `value` in `style` with, before its preview-only `scale` and
 * markers. Without an upload the logo is the QRdx mark. Get code's
 * framework snippets draw exactly this
 * (tests/editor/framework-snippets.test.ts).
 */
export function editorCodeProps(
  style: Partial<ThemeStyles>,
  value: string,
): QRCodeProps {
  return {
    value,
    art: style.art,
    bgColor: style.bgColor,
    fgColor: style.fgColor,
    eyeColor: style.eyeColor,
    dotColor: style.dotColor,
    bodyPattern: style.bodyPattern,
    cornerEyePattern: style.cornerEyePattern,
    cornerEyeDotPattern: style.cornerEyeDotPattern,
    level: style.level,
    margin: style.margin,
    templateId: style.templateId,
    frame: style.frame,
    hideLogo: !style.showLogo,
    logo: style.customLogo ?? DEFAULT_QR_LOGO,
    ...styleEngineOptions(style),
  };
}

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
