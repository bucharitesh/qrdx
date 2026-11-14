import { QRCode } from "qrdx";

export function RadialCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      fgColor={{
        type: "radial",
        stops: [
          { color: "#0f766e", offset: 0 },
          { color: "#0c4a6e", offset: 100 },
        ],
      }}
    />
  );
}
