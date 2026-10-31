/** biome-ignore-all lint/style/noMagicNumbers: PostScript output */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: ASCII85 and JPEG parsing */
import type { QRProps } from "../types";
import { downloadFile } from "./download";
import { getPrintLayout, type PrintColorMode } from "./print";
import { type RGBAColor, rgbToCmyk } from "./utils/parse-color";
import { decodePng, deflate } from "./utils/png";
import {
  getPrintBleedColor,
  getPrintBleedFill,
  renderPrintSVG,
} from "./utils/print-shared";
import {
  applyMatrix,
  type Matrix,
  matrixScale,
  multiply,
  parseSvgMarkup,
  type Segment,
  type SvgNode,
} from "./utils/svg-geometry";
import {
  collectGradients,
  formatMatrix,
  invertMatrix,
  type PlacedGradient,
  type SvgGradient,
  shadingDictionary,
} from "./utils/svg-gradient";
import {
  collectGradientColors,
  collectImageHrefs,
  length,
  type PaintState,
  rasterizeImage,
  readStyle,
  SvgPainter,
} from "./utils/svg-painter";

const MM_PER_INCH = 25.4;
const POINTS_PER_MM = 72 / MM_PER_INCH;
const DEFAULT_EPS_SIZE_MM = 50;

export interface EPSOptions {
  /** "cmyk" writes naive CMYK colors, see `rgbToCmyk` (default "rgb") */
  colorMode?: PrintColorMode;
  /** Width of the QR code itself in millimetres (default 50). A frame adds to it. */
  sizeMm?: number;
  /** Bleed on every side, in millimetres (default 0, at most 20) */
  bleedMm?: number;
}

export interface SVGToEPSOptions {
  /**
   * Output width in PostScript points (72 per inch); the height follows the
   * SVG's aspect ratio. Defaults to the SVG's own width (1 unit = 1 point).
   */
  width?: number;
  colorMode?: PrintColorMode;
  /** Bleed on every side, in points (default 0) */
  bleed?: number;
  /**
   * CSS color that fills the bleed area, or `url(#id)` of a gradient in the
   * SVG to continue it as the root's user space places it (default: none)
   */
  bleedColor?: string | null;
  title?: string;
}

// ── Embedded images ────────────────────────────────────────────────────────

type EpsImage =
  | {
      kind: "jpeg";
      width: number;
      height: number;
      components: 1 | 3;
      bytes: Uint8Array;
      progressive: boolean;
    }
  | {
      kind: "raw";
      width: number;
      height: number;
      components: 3 | 4;
      bytes: Uint8Array;
      compressed: boolean;
    };

function dataUrlBytes(href: string): Uint8Array | null {
  const match = /^data:[^,]*?(;base64)?,(.*)$/s.exec(href);
  if (!match) {
    return null;
  }
  try {
    const binary = match[1]
      ? atob(match[2] as string)
      : decodeURIComponent(match[2] as string);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  } catch {
    return null;
  }
}

/** Reads the frame header of a baseline or progressive JPEG. */
function readJpegInfo(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1] as number;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength =
      ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height =
        ((bytes[offset + 5] as number) << 8) | (bytes[offset + 6] as number);
      const width =
        ((bytes[offset + 7] as number) << 8) | (bytes[offset + 8] as number);
      const components = bytes[offset + 9] as number;
      return { width, height, components, progressive: marker === 0xc2 };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/** Composites RGBA over white and converts to RGB or naive CMYK samples. */
async function rawImage(
  decoded: { width: number; height: number; data: Uint8Array },
  cmyk: boolean
): Promise<EpsImage> {
  const { width, height, data } = decoded;
  const components = cmyk ? 4 : 3;
  const samples = new Uint8Array(width * height * components);
  for (let i = 0; i < width * height; i++) {
    const alpha = (data[i * 4 + 3] as number) / 255;
    const r = (data[i * 4] as number) * alpha + 255 * (1 - alpha);
    const g = (data[i * 4 + 1] as number) * alpha + 255 * (1 - alpha);
    const b = (data[i * 4 + 2] as number) * alpha + 255 * (1 - alpha);
    if (cmyk) {
      const [c, m, y, k] = rgbToCmyk(r, g, b);
      samples.set(
        [c * 255, m * 255, y * 255, k * 255].map(Math.round),
        i * components
      );
    } else {
      samples.set(
        [Math.round(r), Math.round(g), Math.round(b)],
        i * components
      );
    }
  }
  const compressed = await deflate(samples);
  return {
    kind: "raw",
    width,
    height,
    components,
    bytes: compressed ?? samples,
    compressed: Boolean(compressed),
  };
}

async function prepareImage(
  href: string,
  cmyk: boolean
): Promise<EpsImage | null> {
  let source = href;
  if (!/^data:image\/(png|jpe?g)[;,]/i.test(source)) {
    // SVG/WebP logos and URLs: the browser can redraw them as PNG.
    const png = await rasterizeImage(source);
    if (!png) {
      return null;
    }
    source = png;
  }
  const bytes = dataUrlBytes(source);
  if (!bytes) {
    return null;
  }
  const jpeg = readJpegInfo(bytes);
  if (jpeg) {
    if (!(jpeg.components === 1 || jpeg.components === 3)) {
      return null;
    }
    return {
      kind: "jpeg",
      width: jpeg.width,
      height: jpeg.height,
      components: jpeg.components,
      bytes,
      progressive: jpeg.progressive,
    };
  }
  const png = await decodePng(bytes);
  return png ? await rawImage(png, cmyk) : null;
}

function ascii85(bytes: Uint8Array): string {
  let out = "";
  let line = 0;
  const push = (chunk: string) => {
    out += chunk;
    line += chunk.length;
    if (line >= 76) {
      out += "\n";
      line = 0;
    }
  };
  for (let i = 0; i < bytes.length; i += 4) {
    const count = Math.min(4, bytes.length - i);
    let value = 0;
    for (let j = 0; j < 4; j++) {
      value = value * 256 + (j < count ? (bytes[i + j] as number) : 0);
    }
    if (value === 0 && count === 4) {
      push("z");
      continue;
    }
    const digits: string[] = [];
    for (let j = 0; j < 5; j++) {
      digits.unshift(String.fromCharCode((value % 85) + 33));
      value = Math.floor(value / 85);
    }
    push(digits.slice(0, count + 1).join(""));
  }
  return `${out}~>`;
}

// ── PostScript writer ──────────────────────────────────────────────────────

const PROLOG = `/qrdxdict 40 dict def
qrdxdict begin
/m {moveto} bind def
/l {lineto} bind def
/c {curveto} bind def
/h {closepath} bind def
/n {newpath} bind def
/f {fill} bind def
/ef {eofill} bind def
/s {stroke} bind def
/w {setlinewidth} bind def
/rg {setrgbcolor} bind def
/cmyk {setcmykcolor} bind def
/latin1 {
  findfont dup length dict begin
  {1 index /FID ne {def} {pop pop} ifelse} forall
  /Encoding ISOLatin1Encoding def
  currentdict end definefont pop
} bind def
/QRDX-Regular /Helvetica latin1
/QRDX-Bold /Helvetica-Bold latin1
end`;

const fmt = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

/** PostScript string literal; characters outside Latin-1 become "?". */
function psString(text: string): string {
  let out = "(";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (char === "(" || char === ")" || char === "\\") {
      out += `\\${char}`;
    } else if (code >= 32 && code < 127) {
      out += char;
    } else if (code >= 160 && code <= 255) {
      out += `\\${code.toString(8).padStart(3, "0")}`;
    } else {
      out += "?";
    }
  }
  return `${out})`;
}

class EpsPainter extends SvgPainter {
  readonly out: string[] = [];
  /** Shading dictionary → the name it is defined under in qrdxdict */
  readonly shadingNames = new Map<string, string>();
  private readonly cmyk: boolean;
  private readonly images: Map<string, EpsImage>;
  usesLevel3 = false;

  constructor(
    cmyk: boolean,
    gradients: Map<string, string>,
    shadings: Map<string, SvgGradient>,
    images: Map<string, EpsImage>
  ) {
    super(gradients, shadings);
    this.cmyk = cmyk;
    this.images = images;
  }

  color(color: RGBAColor): string {
    if (this.cmyk) {
      const [c, m, y, k] = rgbToCmyk(color.r, color.g, color.b);
      return `${fmt(c)} ${fmt(m)} ${fmt(y)} ${fmt(k)} cmyk`;
    }
    return `${fmt(color.r / 255)} ${fmt(color.g / 255)} ${fmt(color.b / 255)} rg`;
  }

  tracePath(segments: Segment[], matrix: Matrix): string {
    const ops: string[] = ["n"];
    let open = false;
    for (const segment of segments) {
      if (segment.op === "M" || (segment.op === "L" && !open)) {
        const [x, y] = applyMatrix(matrix, segment.x, segment.y);
        ops.push(`${fmt(x)} ${fmt(y)} m`);
        open = true;
      } else if (segment.op === "L") {
        const [x, y] = applyMatrix(matrix, segment.x, segment.y);
        ops.push(`${fmt(x)} ${fmt(y)} l`);
      } else if (segment.op === "C") {
        if (!open) {
          continue;
        }
        const [x1, y1] = applyMatrix(matrix, segment.x1, segment.y1);
        const [x2, y2] = applyMatrix(matrix, segment.x2, segment.y2);
        const [x, y] = applyMatrix(matrix, segment.x, segment.y);
        ops.push(
          `${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)} c`
        );
      } else if (open) {
        ops.push("h");
      }
    }
    return ops.join(" ");
  }

  rect(color: RGBAColor, x: number, y: number, width: number, height: number) {
    this.out.push(
      `${this.color(color)} n ${fmt(x)} ${fmt(y)} m ${fmt(x + width)} ${fmt(y)} l ${fmt(x + width)} ${fmt(y + height)} l ${fmt(x)} ${fmt(y + height)} l h f`
    );
  }

  /**
   * Fills the shape with a gradient: clip to its exact outline, then
   * `shfill` (LanguageLevel 3) with the gradient space concatenated.
   */
  shade(segments: Segment[], state: PaintState, gradient: PlacedGradient) {
    const matrix = multiply(state.matrix, gradient.matrix);
    if (!invertMatrix(matrix)) {
      return;
    }
    const dictionary = shadingDictionary(gradient, this.cmyk ? "cmyk" : "rgb");
    let name = this.shadingNames.get(dictionary);
    if (!name) {
      name = `Sh${this.shadingNames.size}`;
      this.shadingNames.set(dictionary, name);
    }
    this.usesLevel3 = true;
    const clip = state.fillRule === "evenodd" ? "eoclip" : "clip";
    this.out.push(
      `gsave ${this.tracePath(segments, state.matrix)} ${clip} n [${formatMatrix(matrix)}] concat ${name} shfill grestore`
    );
  }

  paint(segments: Segment[], node: SvgNode, state: PaintState) {
    if (segments.length === 0) {
      return;
    }
    const opacity = Number.parseFloat(readStyle(node, "opacity") ?? "1");
    const fillOpacity = Number.parseFloat(
      readStyle(node, "fill-opacity") ?? "1"
    );
    if (opacity === 0) {
      return;
    }
    // PostScript has no transparency: partly transparent shapes paint opaque.
    const paint =
      fillOpacity === 0
        ? null
        : this.resolveFill(state.fill, segments, state.viewport);
    if (paint && "gradient" in paint) {
      this.shade(segments, state, paint.gradient);
    }
    const fill = paint && "color" in paint ? paint.color : null;
    const stroke =
      state.strokeWidth > 0 ? this.resolveColor(state.stroke) : null;
    if (!(fill || stroke)) {
      return;
    }
    const path = this.tracePath(segments, state.matrix);
    const fillOp = state.fillRule === "evenodd" ? "ef" : "f";
    if (fill && stroke) {
      this.out.push(`gsave ${this.color(fill)} ${path} ${fillOp} grestore`);
    } else if (fill) {
      this.out.push(`${this.color(fill)} ${path} ${fillOp}`);
    }
    if (stroke) {
      this.out.push(
        `${this.color(stroke)} ${fmt(state.strokeWidth * matrixScale(state.matrix))} w ${path} s`
      );
    }
  }

  text(node: SvgNode, state: PaintState) {
    const content = node.text.replace(/\s+/g, " ").trim();
    const color = this.resolveColor(state.fill);
    if (!(content && color)) {
      return;
    }
    const scale = matrixScale(state.matrix);
    const [x, y] = applyMatrix(
      state.matrix,
      length(node.attrs.x, state.viewport[0]),
      length(node.attrs.y, state.viewport[1])
    );
    const bold =
      state.fontWeight === "bold" ||
      Number.parseInt(state.fontWeight, 10) >= 600;
    const font = bold ? "/QRDX-Bold" : "/QRDX-Regular";
    const fontSize = fmt(state.fontSize * scale);
    const maxWidth = Number.parseFloat(node.attrs["data-max-width"] ?? "");
    const fit =
      maxWidth > 0
        ? ` dup stringwidth pop dup ${fmt(maxWidth * scale)} gt {${fmt(maxWidth * scale)} exch div ${fontSize} mul ${font} findfont exch scalefont setfont} {pop} ifelse`
        : "";
    const align =
      state.textAnchor === "middle"
        ? " dup stringwidth pop 2 div neg 0 rmoveto"
        : state.textAnchor === "end"
          ? " dup stringwidth pop neg 0 rmoveto"
          : "";
    // Rotated text (letters set on a curve): turn the baseline with the
    // matrix. The matrix already flips y, so its x axis gives the PS angle.
    const angle =
      (Math.atan2(state.matrix[1], state.matrix[0]) * 180) / Math.PI;
    if (Math.abs(angle) > 0.01) {
      this.out.push(
        `gsave ${this.color(color)} ${font} findfont ${fontSize} scalefont setfont ${fmt(x)} ${fmt(y)} translate ${fmt(angle)} rotate ${psString(content)}${fit} 0 0 moveto${align} show grestore`
      );
      return;
    }
    this.out.push(
      `gsave ${this.color(color)} ${font} findfont ${fontSize} scalefont setfont ${psString(content)}${fit} ${fmt(x)} ${fmt(y)} moveto${align} show grestore`
    );
  }

  image(node: SvgNode, state: PaintState) {
    const href = node.attrs.href ?? node.attrs["xlink:href"];
    const image = href ? this.images.get(href) : undefined;
    if (!image) {
      return;
    }
    const x = length(node.attrs.x, state.viewport[0]);
    const y = length(node.attrs.y, state.viewport[1]);
    const width = length(node.attrs.width, state.viewport[0]);
    const height = length(node.attrs.height, state.viewport[1]);
    if (width <= 0 || height <= 0) {
      return;
    }
    const [x0, y0] = applyMatrix(state.matrix, x, y);
    const [x1, y1] = applyMatrix(state.matrix, x + width, y + height);
    const { components } = image;
    const colorSpace =
      components === 1
        ? "/DeviceGray"
        : components === 4
          ? "/DeviceCMYK"
          : "/DeviceRGB";
    const decode = Array.from({ length: components }, () => "0 1").join(" ");
    let filters = "/ASCII85Decode filter";
    if (image.kind === "jpeg") {
      filters += " /DCTDecode filter";
      if (image.progressive) {
        this.usesLevel3 = true;
      }
    } else if (image.compressed) {
      filters += " /FlateDecode filter";
      this.usesLevel3 = true;
    }
    this.out.push(
      [
        "gsave",
        `${fmt(Math.min(x0, x1))} ${fmt(Math.min(y0, y1))} translate ${fmt(Math.abs(x1 - x0))} ${fmt(Math.abs(y1 - y0))} scale`,
        `${colorSpace} setcolorspace`,
        `<< /ImageType 1 /Width ${image.width} /Height ${image.height} /BitsPerComponent 8 /Decode [${decode}] /ImageMatrix [${image.width} 0 0 -${image.height} 0 ${image.height}] /DataSource currentfile ${filters} >> image`,
        ascii85(image.bytes),
        "grestore",
      ].join("\n")
    );
  }
}

/**
 * Converts SVG markup (as this library renders it) to an Encapsulated
 * PostScript file: vector paths for modules, eyes and frames, Helvetica for
 * frame text (Latin-1 only), no transparency. Linear and radial gradient
 * fills become smooth shadings clipped to each shape (`shfill`, which makes
 * the file LanguageLevel 3); gradient strokes and text use their first color.
 * PNG and JPEG logos are embedded; other logo formats are redrawn as PNG in
 * the browser and left out elsewhere.
 */
export async function svgToEPS(
  svg: string,
  options: SVGToEPSOptions = {}
): Promise<string> {
  const root = parseSvgMarkup(svg);
  if (!root) {
    throw new Error("Could not read the SVG to convert to EPS");
  }
  const rootWidth = length(root.attrs.width, 0, 0) || 512;
  const rootHeight = length(root.attrs.height, 0, 0) || rootWidth;
  const width = options.width ?? rootWidth;
  if (!(Number.isFinite(width) && width > 0)) {
    throw new Error("EPS width must be a positive number of points");
  }
  const scale = width / rootWidth;
  const height = rootHeight * scale;
  const bleed = Math.max(0, options.bleed ?? 0);
  const pageWidth = width + 2 * bleed;
  const pageHeight = height + 2 * bleed;
  const cmyk = options.colorMode === "cmyk";

  const images = new Map<string, EpsImage>();
  for (const href of collectImageHrefs(root, new Set())) {
    const image = await prepareImage(href, cmyk);
    if (image) {
      images.set(href, image);
    }
  }

  const painter = new EpsPainter(
    cmyk,
    collectGradientColors(root, new Map()),
    collectGradients(root),
    images
  );

  // SVG's y axis points down, PostScript's up.
  const matrix: Matrix = multiply(
    [1, 0, 0, -1, bleed, pageHeight - bleed],
    [scale, 0, 0, scale, 0, 0]
  );
  const state: PaintState = {
    matrix,
    viewport: [rootWidth, rootHeight],
    fill: "#000000",
    fillRule: "nonzero",
    stroke: "none",
    strokeWidth: 1,
    fontSize: 16,
    fontWeight: "normal",
    textAnchor: "start",
  };

  // Extend the edge color into the bleed so trimming leaves no white sliver;
  // a gradient background continues into it.
  const bleedFill = bleed > 0 ? (options.bleedColor ?? undefined) : undefined;
  if (
    !(
      bleedFill &&
      painter.paintBleed(root, state, bleedFill, [0, 0, pageWidth, pageHeight])
    )
  ) {
    const bleedColor = bleedFill ? painter.resolveColor(bleedFill) : null;
    if (bleedColor) {
      painter.rect(bleedColor, 0, 0, pageWidth, pageHeight);
    }
  }

  painter.walk(root, state, true);

  const title = (options.title ?? "QR code").replace(/[^\x20-\x7e]/g, "?");
  return [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(pageWidth)} ${Math.ceil(pageHeight)}`,
    `%%HiResBoundingBox: 0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}`,
    `%%Title: ${psString(title)}`,
    "%%Creator: qrdx",
    `%%LanguageLevel: ${painter.usesLevel3 ? 3 : 2}`,
    "%%DocumentData: Clean7Bit",
    "%%EndComments",
    "%%BeginProlog",
    PROLOG,
    "%%EndProlog",
    "qrdxdict begin",
    ...Array.from(
      painter.shadingNames,
      ([dictionary, name]) => `/${name} ${dictionary} def`
    ),
    "gsave",
    ...painter.out,
    "grestore",
    "end",
    "showpage",
    "%%Trailer",
    "%%EOF",
    "",
  ].join("\n");
}

/**
 * Renders a vector EPS for print and design tools (Illustrator, InDesign,
 * CorelDRAW): the QR code is `sizeMm` wide (default 50 mm), plus any frame
 * and bleed. See `svgToEPS` for what is converted and what is left out.
 */
export async function getQRAsEPS(
  props: QRProps,
  options: EPSOptions = {}
): Promise<string> {
  const layout = getPrintLayout(props, {
    size: options.sizeMm ?? DEFAULT_EPS_SIZE_MM,
    unit: "mm",
    bleed: options.bleedMm,
  });
  const markup = await renderPrintSVG(props);
  return await svgToEPS(markup, {
    width: layout.trimWidth * POINTS_PER_MM,
    bleed: layout.bleed * POINTS_PER_MM,
    bleedColor:
      layout.bleed > 0
        ? getPrintBleedFill(props, markup)
        : getPrintBleedColor(props),
    colorMode: options.colorMode,
  });
}

/** EPS text as a `data:application/postscript` URL (EPS output is 7-bit ASCII). */
export function epsToDataUrl(eps: string): string {
  return `data:application/postscript;base64,${btoa(eps)}`;
}

/** Downloads `getQRAsEPS` output (browser only). */
export async function downloadPrintEPS(
  props: QRProps,
  options: EPSOptions & { filename?: string } = {}
): Promise<void> {
  const eps = await getQRAsEPS(props, options);
  downloadFile(epsToDataUrl(eps), options.filename ?? "qr-code-print.eps");
}
