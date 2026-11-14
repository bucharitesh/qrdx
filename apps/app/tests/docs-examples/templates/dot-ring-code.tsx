import { QRCode } from "qrdx";

export function DotRingCode() {
  return (
    <QRCode
      value="https://example.com"
      size={512}
      templateId="DotRing"
      bodyPattern="circle-large"
      customProps={{
        customText: "Scan for the menu",
        textPosition: "bottom",
        textColor: "#fde047",
        outerCircleColor: "#1e3a8a",
      }}
    />
  );
}
