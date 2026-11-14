import { QrCodeCard } from "@/registry/qrdx/qr-code-card";

export function BrandCard() {
  return (
    <QrCodeCard
      value="https://example.com"
      title="example.com"
      qr={{
        fgColor: "#155DFC",
        bodyPattern: "rounded",
        cornerEyePattern: "extra-rounded",
      }}
    />
  );
}
