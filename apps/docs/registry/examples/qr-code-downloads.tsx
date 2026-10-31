import { QrCode } from "@/registry/qrdx/qr-code";

export default function QrCodeDownloads() {
  return (
    <QrCode
      bodyPattern="rounded"
      downloadFormats={["png", "jpg", "svg", "pdf"]}
      downloadSize={2048}
      filename="qrdx-poster"
      fgColor="#0F172A"
      size={160}
      value="https://qrdx.dev"
    />
  );
}
