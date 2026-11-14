import { QRCode } from "qrdx";

export function LightCode() {
  return (
    <QRCode
      value="https://example.com"
      bodyPattern="liquid"
      moduleScale={0.8}
    />
  );
}
