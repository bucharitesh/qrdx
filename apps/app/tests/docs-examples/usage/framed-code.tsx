import { QRCode } from "qrdx";

export function FramedCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      frame={{ style: "banner-bottom", text: "Scan me", color: "#0f172a" }}
    />
  );
}
