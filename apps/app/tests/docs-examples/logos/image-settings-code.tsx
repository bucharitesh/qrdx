import { QRCodeSVG } from "qrdx";

export function ImageSettingsCode() {
  return (
    <QRCodeSVG
      value="https://example.com"
      size={512}
      level="H"
      autoLevel
      imageSettings={{
        src: "/logo.png",
        width: 110,
        height: 110,
        excavate: true,
        padding: 8,
      }}
    />
  );
}
