import { QRCode } from "qrdx";

export function BrandCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      fgColor="#1d4ed8"
      bgColor="#f8fafc"
      eyeColor="#0f172a"
      dotColor="#1d4ed8"
    />
  );
}
