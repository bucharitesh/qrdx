import { QRCode } from "qrdx";

export function LogoQrCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      margin={4}
      level="H"
      logo="/logo.png"
    />
  );
}
