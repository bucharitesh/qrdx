import type { QRProps } from "../types";
import { FLAM_QR_LOGO } from "./constants";

interface QRDataProps {
  value: string;
  size?: number;
  fgColor?: any;
  bgColor?: any;
  eyeColor?: any;
  dotColor?: any;
  bodyPattern?: any;
  cornerEyePattern?: any;
  cornerEyeDotPattern?: any;
  margin?: number;
  level?: any;
  templateId?: string;
  hideLogo?: boolean;
  logo?: string;
  type?: "default" | "logo_qr";
  imageSettings?: any;
  logoSettings?: any;
}

type QRDataResult = QRProps & { size: number };

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
  type,
  imageSettings,
  logoSettings,
}: QRDataProps): QRDataResult {
  const isLogoQR = type === "logo_qr";

  const baseProps = {
    value: `${value}`,
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
  };

  // Return Logo QR props
  if (isLogoQR && logoSettings) {
    return {
      ...baseProps,
      type: "logo_qr" as const,
      logoSettings,
    };
  }

  // Return Default QR props
  return {
    ...baseProps,
    type: "default" as const,
    imageSettings: !hideLogo
      ? imageSettings || {
          src: logo || FLAM_QR_LOGO,
          height: 256,
          width: 256,
          excavate: true,
        }
      : undefined,
  };
}
