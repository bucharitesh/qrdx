import { QRCode } from "qrdx";

export function DocsRingCode() {
  return (
    <QRCode
      value="https://example.com/docs"
      size={512}
      templateId="DotRing"
      customProps={{ customText: "Read the docs *", textFill: "repeat" }}
    />
  );
}
