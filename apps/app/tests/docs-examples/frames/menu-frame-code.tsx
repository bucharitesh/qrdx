import { QRCode } from "qrdx";

export function MenuFrameCode() {
  return (
    <QRCode
      value="https://example.com/menu"
      size={256}
      frame={{
        style: "banner-bottom",
        text: "Scan for the menu",
        color: "#1e3a8a",
      }}
    />
  );
}
