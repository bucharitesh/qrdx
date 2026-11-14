import { QRCode } from "qrdx";

export function LogoCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      level="H"
      logo="/logo.png"
      logoOptions={{ size: 0.2, padding: 1 }}
    />
  );
}
