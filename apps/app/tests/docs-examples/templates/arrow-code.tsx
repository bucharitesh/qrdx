import { QRCode } from "qrdx";

export function ArrowCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      templateId="Arrow"
      fgColor="#1a56db"
    />
  );
}
