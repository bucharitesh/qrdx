import { writeFileSync } from "node:fs";
import type { QRProps } from "qrdx";
import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type OutputFormat = "svg" | "png";

export interface OutputOptions extends QRProps {
  size?: number;
  outputPath: string;
  format: OutputFormat;
}

export function buildSVGString(props: QRProps & { size?: number }): string {
  const element = createElement(QRCodeSVG as React.ComponentType<QRProps>, {
    size: props.size ?? 512,
    ...props,
  });
  return renderToStaticMarkup(element);
}

export async function saveOutput(options: OutputOptions): Promise<void> {
  const { outputPath, format, ...qrProps } = options;

  const svgString = buildSVGString(qrProps);

  if (format === "svg") {
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
    writeFileSync(outputPath, svgContent, "utf-8");
    return;
  }

  type SharpFactory = typeof import("sharp");
  let sharp: SharpFactory;
  try {
    const mod = await import("sharp");
    sharp = (mod as { default: SharpFactory }).default;
  } catch {
    throw new Error(
      "PNG output needs the sharp package (native binaries). It is optional and may not have installed; use SVG or reinstall: https://sharp.pixelplumbing.com/install"
    );
  }
  const svgBuffer = Buffer.from(svgString, "utf-8");
  const size = qrProps.size ?? 512;

  await sharp(svgBuffer).resize(size, size).png().toFile(outputPath);
}
