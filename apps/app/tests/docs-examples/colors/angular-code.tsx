import { QRCode } from "qrdx";

export function AngularCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      fgColor={{
        type: "angular",
        angle: 30,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#7c3aed", offset: 50 },
          { color: "#1d4ed8", offset: 100 },
        ],
      }}
    />
  );
}
