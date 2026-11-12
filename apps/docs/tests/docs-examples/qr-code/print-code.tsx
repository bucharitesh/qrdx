import { QrCode } from "@/registry/qrdx/qr-code";

export function TableCode() {
  return (
    <QrCode
      value="https://example.com/order?table=12"
      level="H"
      margin={4}
      downloadFormats={["svg", "png", "pdf"]}
      downloadSize={2048}
      filename="table-12"
    />
  );
}
