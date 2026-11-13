import {
  QrCodeGenerator,
  type QrCodePreset,
} from "@/registry/qrdx/qr-code-generator";

const brandPresets: QrCodePreset[] = [
  {
    id: "brand",
    name: "Brand",
    style: {
      fgColor: "#155DFC",
      bodyPattern: "rounded",
      cornerEyePattern: "extra-rounded",
    },
  },
  {
    id: "ink",
    name: "Ink",
    style: { fgColor: "#0F172A", bodyPattern: "square" },
  },
  {
    id: "print",
    name: "Print",
    style: {
      fgColor: "#000000",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
      level: "H",
    },
  },
];

export default function QrCodeGeneratorPresets() {
  return (
    <QrCodeGenerator
      defaultValue="https://example.com/spring-sale"
      filename="spring-sale"
      formats={["png", "svg", "jpg"]}
      presets={brandPresets}
      size={176}
    />
  );
}
