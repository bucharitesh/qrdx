import { QRCode } from "qrdx";

export function FramedCode() {
  return (
    <QRCode
      value="https://example.com"
      bodyPattern="liquid"
      cornerEyePattern="leaf"
      cornerEyeDotPattern="leaf"
      frame={{ style: "circle", text: "Scan me", secondaryText: "example.com" }}
    />
  );
}
