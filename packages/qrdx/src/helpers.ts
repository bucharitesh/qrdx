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
  level,
  templateId,
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
  level?: "L" | "M" | "Q" | "H";
  templateId?: string;
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
    level,
    templateId,
    size: 1024,
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
