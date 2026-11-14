// A barcode's SVG (lib/barcode/draw.ts) as a one-page vector PDF, the page
// exactly the barcode's size at one drawing unit per point (the same size as
// the SVG and EPS downloads). bwip-js draws with a small vocabulary: a
// background <rect>, stroked bars (M/L paths with a stroke width) and filled
// shapes and glyphs (M/L/Q/Z paths, some even-odd), so this converts exactly
// those and refuses anything else rather than drop it. Pure: runs in the
// browser (the generator) and on the server (the API). Colors are RGB.
import { zlibSync } from "fflate";
import type { RenderedBarcode } from "./draw";

type Point = [number, number];

const num = (value: number) => {
  const fixed = value.toFixed(3);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
};

function rgb(color: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1] as string, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const colorOperands = ([r, g, b]: [number, number, number]) =>
  [r, g, b].map((channel) => num(channel / 255)).join(" ");

/** PDF path operators for an SVG path's `d` (absolute M, L, H, V, Q, C, Z). */
export function pathOperators(d: string): string[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const ops: string[] = [];
  let index = 0;
  let command = "";
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  const next = () => {
    const token = tokens[index++];
    const value = Number(token);
    if (token === undefined || Number.isNaN(value)) {
      throw new Error(`Unreadable path data near "${token ?? "the end"}"`);
    }
    return value;
  };
  while (index < tokens.length) {
    const token = tokens[index] as string;
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index++;
      if (command === "Z" || command === "z") {
        ops.push("h");
        current = start;
        continue;
      }
    }
    switch (command) {
      case "M": {
        current = [next(), next()];
        start = current;
        ops.push(`${num(current[0])} ${num(current[1])} m`);
        // Further pairs after M are line-tos.
        command = "L";
        break;
      }
      case "L": {
        current = [next(), next()];
        ops.push(`${num(current[0])} ${num(current[1])} l`);
        break;
      }
      case "H": {
        current = [next(), current[1]];
        ops.push(`${num(current[0])} ${num(current[1])} l`);
        break;
      }
      case "V": {
        current = [current[0], next()];
        ops.push(`${num(current[0])} ${num(current[1])} l`);
        break;
      }
      case "C": {
        const points = [next(), next(), next(), next(), next(), next()];
        current = [points[4] as number, points[5] as number];
        ops.push(`${points.map(num).join(" ")} c`);
        break;
      }
      case "Q": {
        // A quadratic Bézier as the cubic with the same curve.
        const control: Point = [next(), next()];
        const end: Point = [next(), next()];
        const c1: Point = [
          current[0] + (2 / 3) * (control[0] - current[0]),
          current[1] + (2 / 3) * (control[1] - current[1]),
        ];
        const c2: Point = [
          end[0] + (2 / 3) * (control[0] - end[0]),
          end[1] + (2 / 3) * (control[1] - end[1]),
        ];
        ops.push(`${[...c1, ...c2, ...end].map(num).join(" ")} c`);
        current = end;
        break;
      }
      default:
        throw new Error(`Path command "${command || token}" isn't supported`);
    }
  }
  return ops;
}

function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attrs[match[1] as string] = match[2] as string;
  }
  return attrs;
}

/** The page's content stream, in SVG units with y pointing down. */
function contentStream(svg: string): string {
  const ops: string[] = [];
  for (const match of svg.matchAll(/<(rect|path)\b([^>]*)\/?>/g)) {
    const [, tag, rest] = match as unknown as [string, string, string];
    const attrs = attributes(rest);
    if (tag === "rect") {
      const fill = rgb(attrs.fill ?? "");
      if (!fill) continue;
      if (attrs.width !== "100%" || attrs.height !== "100%") {
        throw new Error("Only a full-size background rect is supported");
      }
      ops.push(`${colorOperands(fill)} rg`, "0 0 VIEW_W VIEW_H re", "f");
      continue;
    }
    const d = attrs.d;
    if (!d) continue;
    const path = pathOperators(d);
    const stroke = attrs.stroke ? rgb(attrs.stroke) : null;
    if (stroke) {
      ops.push(
        `${colorOperands(stroke)} RG`,
        `${num(Number(attrs["stroke-width"] ?? 1))} w`,
        ...path,
        "S",
      );
      continue;
    }
    const fill = rgb(attrs.fill ?? "#000000");
    if (!fill || attrs.fill === "none") continue;
    ops.push(
      `${colorOperands(fill)} rg`,
      ...path,
      attrs["fill-rule"] === "evenodd" ? "f*" : "f",
    );
  }
  return ops.join("\n");
}

/** A PDF text string: UTF-16BE with a byte-order mark, as hex. */
function pdfText(value: string): string {
  let hex = "FEFF";
  for (let i = 0; i < value.length; i++) {
    hex += value.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

const encoder = new TextEncoder();

/**
 * A vector PDF of the barcode: one page, `widthUnits` × `heightUnits`
 * points, the drawing compressed with Flate.
 */
export function barcodePDF(
  rendered: RenderedBarcode,
  { title }: { title: string },
): Uint8Array {
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(rendered.svg);
  if (!viewBox) throw new Error("The barcode SVG has no viewBox");
  const viewWidth = Number(viewBox[1]);
  const viewHeight = Number(viewBox[2]);
  const pageWidth = rendered.widthUnits;
  const pageHeight = rendered.heightUnits;
  const sx = pageWidth / viewWidth;
  const sy = pageHeight / viewHeight;

  const drawing = contentStream(rendered.svg)
    .replaceAll("VIEW_W", num(viewWidth))
    .replaceAll("VIEW_H", num(viewHeight));
  // Flip y and scale SVG units to points.
  const content = `q\n${num(sx)} 0 0 ${num(-sy)} 0 ${num(pageHeight)} cm\n${drawing}\nQ\n`;
  const stream = zlibSync(encoder.encode(content), { level: 9 });

  const objects: (string | Uint8Array)[][] = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] /Resources << >> /Contents 4 0 R >>`,
    ],
    [
      `<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`,
      stream,
      "\nendstream",
    ],
    [`<< /Title ${pdfText(title)} /Producer (QRdx) /Creator (QRdx) >>`],
  ];

  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  // The binary comment marks the file as binary for transfer tools.
  push("%PDF-1.4\n%âãÏÓ\n");
  const offsets: number[] = [];
  objects.forEach((parts, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    for (const part of parts) push(part);
    push("\nendobj\n");
  });
  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
