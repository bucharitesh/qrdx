import { QRCode } from "qrdx";

export function HeartCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      shape="heart"
      bodyPattern="rounded"
    />
  );
}
