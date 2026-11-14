import { QRCode } from "qrdx";

export function ShapedCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      bodyPattern="liquid"
      cornerEyePattern="leaf"
      cornerEyeDotPattern="leaf"
    />
  );
}
