import { QrCode } from "@/registry/qrdx/qr-code";

export default function MenuPage() {
  return (
    <QrCode
      value="https://example.com/menu"
      caption="Scan to see the menu"
      filename="menu-qr"
    />
  );
}
