import { QrCode } from "@/registry/qrdx/qr-code";

const sizes = [96, 128, 160];

export default function QrCodeSizes() {
  return (
    <div className="flex flex-wrap items-end justify-center gap-8">
      {sizes.map((size) => (
        <QrCode
          caption={`${size}px`}
          downloadFormats={[]}
          key={size}
          size={size}
          value="https://qrdx.dev"
        />
      ))}
    </div>
  );
}
