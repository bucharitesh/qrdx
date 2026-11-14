import { QRCode } from "qrdx";

export function CircleCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      shape="circle"
      bodyPattern="rounded"
    />
  );
}
