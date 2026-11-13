import { QrCode } from "@/registry/qrdx/qr-code";

export default function QrCodeTemplate() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-8">
      <QrCode
        caption="StandardBox"
        downloadFormats={[]}
        size={150}
        templateId="StandardBox"
        value="https://qrdx.dev"
      />
      <QrCode
        caption="Arrow"
        downloadFormats={[]}
        size={150}
        templateId="Arrow"
        value="https://qrdx.dev"
      />
      <QrCode
        caption="SquareBorder"
        downloadFormats={[]}
        size={150}
        templateId="SquareBorder"
        value="https://qrdx.dev"
      />
    </div>
  );
}
