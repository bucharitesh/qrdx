import type { BodyPattern } from "@/types";
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
}) {
  return {
    value: `${url}?qr=1`,
    bgColor,
    fgColor,
    eyeColor,
    dotColor,
    bodyPattern,
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
