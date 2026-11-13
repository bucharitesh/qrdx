import { QrCode } from "@/registry/qrdx/qr-code";

export default function QrCodeColors() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-8">
      <QrCode
        caption="Solid"
        downloadFormats={[]}
        fgColor="#155DFC"
        size={140}
        value="https://qrdx.dev"
      />
      <QrCode
        caption="Accent eyes"
        dotColor="#E11D48"
        downloadFormats={[]}
        eyeColor="#0F172A"
        fgColor="#334155"
        size={140}
        value="https://qrdx.dev"
      />
      <QrCode
        bgColor="#FEF3C7"
        caption="Tinted background"
        downloadFormats={[]}
        fgColor="#78350F"
        size={140}
        value="https://qrdx.dev"
      />
    </div>
  );
}
