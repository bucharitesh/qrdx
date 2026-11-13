import { QrCodeCard } from "@/registry/qrdx/qr-code-card";

export default function QrCodeCardFrames() {
  return (
    <div className="grid w-full gap-6 sm:grid-cols-3">
      <QrCodeCard
        size={120}
        title="Bottom label"
        value="https://qrdx.dev/menu"
      />
      <QrCodeCard
        cta="Menu"
        frame="top"
        frameClassName="bg-primary text-primary-foreground"
        size={120}
        title="Top, brand color"
        value="https://qrdx.dev/menu"
      />
      <QrCodeCard
        frame="none"
        size={120}
        title="No frame"
        value="https://qrdx.dev/menu"
      />
    </div>
  );
}
