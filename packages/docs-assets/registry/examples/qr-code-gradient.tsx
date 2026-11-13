import { QrCode } from "@/registry/qrdx/qr-code";

export default function QrCodeGradient() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-8">
      <QrCode
        bodyPattern="circle"
        caption="Linear gradient"
        cornerEyePattern="rounded"
        fgColor={{
          type: "linear",
          angle: 45,
          stops: [
            { color: "#4F46E5", offset: 0 },
            { color: "#DB2777", offset: 100 },
          ],
        }}
        size={160}
        value="https://qrdx.dev"
      />
      <QrCode
        bodyPattern="rounded"
        caption="Radial gradient"
        cornerEyePattern="extra-rounded"
        fgColor={{
          type: "radial",
          stops: [
            { color: "#0F766E", offset: 0 },
            { color: "#0C4A6E", offset: 100 },
          ],
        }}
        size={160}
        value="https://qrdx.dev"
      />
    </div>
  );
}
