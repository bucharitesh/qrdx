import { QRCode } from "qrdx";

export function GradientCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      fgColor={{
        type: "linear",
        angle: 45,
        stops: [
          { color: "#4f46e5", offset: 0 },
          { color: "#db2777", offset: 100 },
        ],
      }}
    />
  );
}
