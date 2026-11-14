import { QRCode } from "qrdx";

export function FirstQrCode() {
  return <QRCode value="https://example.com" size={256} />;
}
