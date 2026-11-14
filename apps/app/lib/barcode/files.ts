// The file types a barcode downloads as, everywhere: the generator, the
// dashboard, the image API and MCP. Pure and client-safe.

export const BARCODE_FILE_TYPES = [
  "png",
  "jpg",
  "webp",
  "avif",
  "svg",
  "pdf",
  "eps",
] as const;

export type BarcodeFileType = (typeof BARCODE_FILE_TYPES)[number];

export interface BarcodeFileInfo {
  label: string;
  mime: string;
  /** A vector file sized in points (one module = 0.353 mm), not pixels */
  vector: boolean;
  /** Made by QRdx's server; the rest can also be made in the browser */
  serverOnly: boolean;
  /** One line for menus */
  hint: string;
}

export const BARCODE_FILES: Record<BarcodeFileType, BarcodeFileInfo> = {
  png: {
    label: "PNG",
    mime: "image/png",
    vector: false,
    serverOnly: false,
    hint: "Screens, documents and online shops",
  },
  jpg: {
    label: "JPG",
    mime: "image/jpeg",
    vector: false,
    serverOnly: false,
    hint: "Where PNG isn't accepted",
  },
  webp: {
    label: "WebP",
    mime: "image/webp",
    vector: false,
    serverOnly: true,
    hint: "Smaller files for websites",
  },
  avif: {
    label: "AVIF",
    mime: "image/avif",
    vector: false,
    serverOnly: true,
    hint: "The smallest files for modern browsers",
  },
  svg: {
    label: "SVG",
    mime: "image/svg+xml",
    vector: true,
    serverOnly: false,
    hint: "Vector for print and design tools",
  },
  pdf: {
    label: "PDF",
    mime: "application/pdf",
    vector: true,
    serverOnly: false,
    hint: "Vector, opens anywhere, for print",
  },
  eps: {
    label: "EPS",
    mime: "application/postscript",
    vector: true,
    serverOnly: false,
    hint: "Vector for older print workflows",
  },
};

export function isBarcodeFileType(value: string): value is BarcodeFileType {
  return (BARCODE_FILE_TYPES as readonly string[]).includes(value);
}

/** A file type from a URL or menu: case-insensitive, "jpeg" for "jpg". */
export function parseBarcodeFileType(value: string): BarcodeFileType | null {
  const lower = value.trim().toLowerCase();
  const type = lower === "jpeg" ? "jpg" : lower;
  return isBarcodeFileType(type) ? type : null;
}

/** "ean13-5901234123457", from the format and the value, for file names. */
export function barcodeFileStem(format: string, value: string): string {
  const slug = value
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `${format}-${slug}` : format;
}
