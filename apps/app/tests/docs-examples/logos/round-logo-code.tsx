import { QRCode } from "qrdx";

export function RoundLogoCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      level="H"
      logo="/logo.png"
      logoOptions={{ size: 0.22, shape: "circle", plate: "#ffffff" }}
    />
  );
}
