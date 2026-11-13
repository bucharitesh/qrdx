import "server-only";

import { readFile } from "node:fs/promises";
import { ogFontPath } from "@repo/design-system/og/font-files";
import { type Font, parse } from "opentype.js";
import { logError } from "@/lib/log-error";

// Server PNGs are rasterized by next/og (sharp's librsvg, else resvg) from
// the engine's SVG, and on Vercel that rasterizer has no fonts: a frame
// label's <text> came out as a row of empty boxes. So before rasterizing,
// each <text> becomes a <path> of its glyphs, in Geist (SIL OFL 1.1, the
// files and licence in @repo/design-system/og/fonts), the shipped face
// closest to the frame's system-ui stack. The rasterizer then needs no font
// at all.
//
// Only SVGs with text change: anything else is returned as it is, so those
// PNGs keep their exact bytes. SVG and EPS downloads never come through
// here; they keep their <text>.

/** The weights shipped (@repo/design-system/og/fonts), by the CSS weights they stand for. */
const FACES = [
  { min: 650, file: "Geist-Bold.ttf" },
  { min: 550, file: "Geist-SemiBold.ttf" },
  { min: 0, file: "Geist-Regular.ttf" },
] as const;

type Face = (typeof FACES)[number]["file"];

const fonts = new Map<Face, Promise<Font>>();

function fontFor(weight: number): Promise<Font> {
  const face = (FACES.find((each) => weight >= each.min) ?? FACES[0]).file;
  let font = fonts.get(face);
  if (!font) {
    // next.config.ts lists the files in outputFileTracingIncludes, so the
    // build ships them with the functions that read them.
    font = readFile(ogFontPath(face)).then((data) =>
      parse(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      ),
    );
    font.catch(() => fonts.delete(face));
    fonts.set(face, font);
  }
  return font;
}

const TEXT_ELEMENT = /<text\b([^>]*)>([^<]*)<\/text>/g;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;

/** The SVG serializer's escapes (lib/qr-render.ts), undone. */
const unescapeXml = (value: string) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");

function attributesOf(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name, value] of source.matchAll(ATTRIBUTE)) {
    attributes.set(name as string, unescapeXml(value as string));
  }
  return attributes;
}

/** One <text> as a filled <path> of its glyphs ("" when nothing shows). */
async function outline(source: string, content: string): Promise<string> {
  const attributes = attributesOf(source);
  const text = unescapeXml(content);
  const fontSize = Number(attributes.get("font-size") ?? 16);
  const weight = Number(attributes.get("font-weight") ?? 400) || 400;
  if (!(text.trim() && fontSize > 0)) return "";
  const font = await fontFor(weight);
  const x = Number(attributes.get("x") ?? 0);
  const y = Number(attributes.get("y") ?? 0);
  const anchor = attributes.get("text-anchor") ?? "start";
  const width = font.getAdvanceWidth(text, fontSize, { kerning: true });
  const start =
    anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  const d = font
    .getPath(text, start, y, fontSize, { kerning: true })
    .toPathData(2);
  if (!d) return "";
  const fill = attributes.get("fill") ?? "#000000";
  const transform = attributes.get("transform");
  return `<path d="${d}" fill="${escapeAttribute(fill)}"${
    transform ? ` transform="${escapeAttribute(transform)}"` : ""
  }/>`;
}

/**
 * `svg` with every <text> drawn as glyph outlines, so a rasterizer without
 * fonts draws the same letters. Returned as it is when there's no text.
 */
export async function outlineSvgText(svg: string): Promise<string> {
  if (!svg.includes("<text")) return svg;
  const matches = [...svg.matchAll(TEXT_ELEMENT)];
  if (matches.length === 0) return svg;
  let paths: string[];
  try {
    paths = await Promise.all(
      matches.map(([, source, content]) =>
        outline(source as string, content as string),
      ),
    );
  } catch (error) {
    // A missing font file is a deploy bug, but the code must still render.
    logError(error as Error, { action: "outlineSvgText" });
    return svg;
  }
  let index = 0;
  return svg.replace(TEXT_ELEMENT, () => paths[index++] ?? "");
}
