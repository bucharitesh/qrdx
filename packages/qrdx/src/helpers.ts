import { FLAM_QR_LOGO } from "./constants";

export function getQRData({
  url,
  fgColor,
  bgColor,
  eyeColor,
  dotColor,
  dotPattern,
  hideLogo,
  logo,
  margin,
}: {
  url: string;
  fgColor?: string;
  bgColor?: string;
  eyeColor?: string;
  dotColor?: string;
  dotPattern?:
    | "circle"
    | "square"
    | "diamond"
    | "circle-mixed"
    | "pacman"
    | "rounded"
    | "clean-square";
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
    dotPattern,
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
