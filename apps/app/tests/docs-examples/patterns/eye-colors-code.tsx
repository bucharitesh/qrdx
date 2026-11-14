import { QRCode } from "qrdx";

export function EyeColorsCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      eyeColor="#111827"
      eyeColors={{
        topLeft: { outer: "#dc2626", inner: "#1d4ed8" },
        topRight: { outer: "#16a34a" },
      }}
    />
  );
}
