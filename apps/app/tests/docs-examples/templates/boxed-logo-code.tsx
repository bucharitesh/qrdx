import { QRCode } from "qrdx";

export function BoxedLogoCode() {
  return (
    <QRCode
      value="https://example.com"
      size={512}
      templateId="StandardBox"
      fgColor="#1a56db"
      level="H"
      logo="/logo.png"
    />
  );
}
