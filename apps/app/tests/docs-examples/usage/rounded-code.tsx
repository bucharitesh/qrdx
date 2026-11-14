import { QRCode } from "qrdx";

export function RoundedCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      bodyPattern="rounded"
      cornerEyePattern="extra-rounded"
      cornerEyeDotPattern="rounded"
    />
  );
}
