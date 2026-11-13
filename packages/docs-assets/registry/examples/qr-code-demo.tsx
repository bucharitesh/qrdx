import { QrCode } from "@/registry/qrdx/qr-code";

export default function QrCodeDemo() {
  return (
    <QrCode
      bodyPattern="rounded"
      caption="Scan to open qrdx.dev"
      cornerEyeDotPattern="rounded"
      cornerEyePattern="extra-rounded"
      size={180}
      value="https://qrdx.dev"
    />
  );
}
