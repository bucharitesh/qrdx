import { QRCodeSVG } from "qrdx";

export default function Page() {
  return (
    <QRCodeSVG
      value="https://example.com"
      size={256}
      margin={4}
      role="img"
      aria-label="QR code for example.com"
    />
  );
}
