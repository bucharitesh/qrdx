import type { QRProps } from "../types";
import { FLAM_QR_LOGO } from "./constants";

interface QRDataProps extends QRProps {
  hideLogo?: boolean;
  logo?: string;
}

interface QRDataResult extends QRProps {
  size: number; // Required in result
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
  margin,
  cornerEyePattern,
  cornerEyeDotPattern,
  level,
  templateId,
}: QRDataProps): QRDataResult {
  return {
    value: `${value}?qr=1`,
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
