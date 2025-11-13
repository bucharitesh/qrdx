import type { QRStyle } from "../types/qr";

/**
 * Default QR code style
 */
export const defaultQRStyle: Partial<QRStyle> = {
  bgColor: "#ffffff",
  fgColor: "#000000",
  eyeColor: "#000000",
  dotColor: "#000000",
  bodyPattern: "circle",
  cornerEyePattern: "gear",
  cornerEyeDotPattern: "circle",
  level: "Q",
  margin: 0,
  size: 1024,
  showLogo: false,
};
