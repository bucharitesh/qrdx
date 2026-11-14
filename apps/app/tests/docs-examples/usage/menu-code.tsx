import { QRCode } from "qrdx";

export function MenuCode() {
  return (
    <div role="img" aria-label="QR code for the menu">
      <QRCode value="https://example.com/menu" size={256} margin={4} />
    </div>
  );
}
