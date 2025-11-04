import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
} from "@/types";
import { FLAM_QR_LOGO } from "./constants";

export function getQRData({
  url,
  fgColor,
  bgColor,
  eyeColor,
  dotColor,
  bodyPattern,
  hideLogo,
  logo,
  margin,
  cornerEyePattern,
  cornerEyeDotPattern,
  errorLevel,
  fontSize,
  fontWeight,
  fontLetterSpacing,
  templateId,
  customText,
}: {
  url: string;
  fgColor?: string;
  bgColor?: string;
  eyeColor?: string;
  dotColor?: string;
  bodyPattern?: BodyPattern;
  hideLogo?: boolean;
  logo?: string;
  margin?: number;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  errorLevel?: "L" | "M" | "Q" | "H";
  fontSize?: number;
  fontWeight?: number;
  fontLetterSpacing?: number;
  templateId?: string;
  customText?: string;
}) {
  return {
    value: `${url}?qr=1`,
    bgColor,
    fgColor,
    eyeColor,
    dotColor,
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    errorLevel,
    fontSize,
    fontWeight,
    fontLetterSpacing,
    templateId,
    customText,
    size: 1024,
    level: "Q", // QR Code error correction level: https://blog.qrstuff.com/general/qr-code-error-correction
    hideLogo,
    margin,
    ...(!hideLogo && {
      imageSettings: {
        src: logo || FLAM_QR_LOGO,
        height: 256,
        width: 256,
        excavate: true,
      },
    }),
  };
}
