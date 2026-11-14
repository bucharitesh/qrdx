import { QRCode } from "qrdx";

export function StyledQrCode() {
  return (
    <QRCode
      value="https://example.com/menu"
      size={256}
      margin={4}
      fgColor="#1d4ed8"
      bodyPattern="rounded"
      cornerEyePattern="extra-rounded"
      cornerEyeDotPattern="rounded"
      frame={{ style: "banner-bottom", text: "Scan for the menu" }}
    />
  );
}
