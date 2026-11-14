import { QRCode } from "qrdx";

export function PlacedLogoCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      level="H"
      logo="/logo.png"
      logoOptions={{ size: 0.2, padding: 1, x: 0.6, y: 0.55 }}
    />
  );
}
