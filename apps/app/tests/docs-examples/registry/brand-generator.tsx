import {
  QR_CODE_PRESETS,
  QrCodeGenerator,
} from "@/registry/qrdx/qr-code-generator";

export function BrandGenerator() {
  return (
    <QrCodeGenerator
      presets={[
        ...QR_CODE_PRESETS,
        { id: "brand", name: "Brand", style: { fgColor: "#155DFC" } },
      ]}
    />
  );
}
