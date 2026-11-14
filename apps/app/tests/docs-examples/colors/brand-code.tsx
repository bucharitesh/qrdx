import { QRCode } from "qrdx";

export function BrandCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      fgColor="#1a56db"
      bgColor="#f9fafb"
      eyeColor="#0d47a1"
      dotColor="#3b82f6"
    />
  );
}
