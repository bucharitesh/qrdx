import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { QRProps } from "qrdx";
import { getFrameDimensions, QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type OutputFormat = "svg" | "png";

export interface OutputOptions extends QRProps {
  size?: number;
  outputPath: string;
  format: OutputFormat;
}

type SharpFactory = typeof import("sharp");

export function buildSVGString(props: QRProps & { size?: number }): string {
  const element = createElement(QRCodeSVG as React.ComponentType<QRProps>, {
    size: props.size ?? 512,
    ...props,
  });
  return renderToStaticMarkup(element);
}

async function loadLogo(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    const payload = src.slice(comma + 1);
    return src.slice(0, comma).endsWith(";base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload));
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(
        `Could not download logo (${res.status} ${res.statusText}): ${src}`
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(src);
}

/**
 * Finds the logo's pixel box in the rendered output. The <image> is swapped for
 * a lone visible rect, so the box comes out right even inside template transforms.
 */
async function findLogoBox(sharp: SharpFactory, svgString: string) {
  const imageTag = svgString.match(/<image\b[^>]*?(?:\/>|><\/image>)/)?.[0];
  if (!imageTag) {
    return null;
  }
  const markerTag = imageTag
    .replace(/^<image\b/, '<rect class="qrdx-logo-box"')
    .replace(/\shref="[^"]*"/, "")
    .replace(/(?:\/>|><\/image>)$/, ' fill="#000"/>');
  const markerSvg = svgString
    .replace(imageTag, markerTag)
    .replace(
      /<svg\b[^>]*>/,
      (open) =>
        `${open}<style>*{visibility:hidden}.qrdx-logo-box{visibility:visible}</style>`
    );
  const { info } = await sharp(Buffer.from(markerSvg, "utf-8"))
    .png()
    .trim()
    .toBuffer({ resolveWithObject: true });
  return {
    left: -(info.trimOffsetLeft ?? 0),
    top: -(info.trimOffsetTop ?? 0),
    width: info.width,
    height: info.height,
  };
}

export async function saveOutput(options: OutputOptions): Promise<void> {
  const { outputPath, format, ...qrProps } = options;

  const svgString = buildSVGString(qrProps);

  if (format === "svg") {
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
    writeFileSync(outputPath, svgContent, "utf-8");
    return;
  }

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
  // A frame makes the output larger than (and not as square as) the code.
  const { width, height } = getFrameDimensions(size, qrProps.frame);
  const qrImage = sharp(svgBuffer)
    .resize(Math.round(width), Math.round(height))
    .png();

  // sharp's bundled SVG renderer skips embedded <image> elements, so the logo
  // is composited onto the rendered QR code instead.
  const logoSrc = qrProps.imageSettings?.src;
  const box = logoSrc ? await findLogoBox(sharp, svgString) : null;
  if (!(logoSrc && box)) {
    await qrImage.toFile(outputPath);
    return;
  }

  const logo = await sharp(await loadLogo(logoSrc))
    .resize(box.width, box.height, { fit: "fill" })
    .png()
    .toBuffer();
  await sharp(await qrImage.toBuffer())
    .composite([{ input: logo, left: box.left, top: box.top }])
    .png()
    .toFile(outputPath);
}
