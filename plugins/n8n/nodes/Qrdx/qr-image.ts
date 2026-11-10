import {
  DATA_MAX_LENGTH,
  FRAME_TEXT_MAX_LENGTH,
  QR_IMAGE_FORMATS,
  type QrImageFormat,
} from "./constants";

// GET /qr: the keyless image endpoint. Builds its query from the node's
// options and names the file it returns.

/** The node's QR image options (all optional), by parameter name. */
export interface QrImageOptions {
  size?: number;
  foregroundColor?: string;
  backgroundColor?: string;
  eyeColor?: string;
  dotColor?: string;
  bodyShape?: string;
  eyeShape?: string;
  eyeDotShape?: string;
  errorCorrection?: string;
  margin?: number;
  frame?: string;
  frameText?: string;
  logoIcon?: string;
  fileName?: string;
  baseUrl?: string;
}

/** Option → query parameter of GET /qr. */
const QUERY_NAMES = {
  size: "size",
  foregroundColor: "fg",
  backgroundColor: "bg",
  eyeColor: "eyeColor",
  dotColor: "dotColor",
  bodyShape: "body",
  eyeShape: "eye",
  eyeDotShape: "dot",
  errorCorrection: "level",
  margin: "margin",
  frame: "frame",
  logoIcon: "logoIcon",
} as const satisfies Partial<Record<keyof QrImageOptions, string>>;

const COLOR_OPTIONS = new Set<keyof QrImageOptions>([
  "foregroundColor",
  "backgroundColor",
  "eyeColor",
  "dotColor",
]);

const HEX_COLOR = /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const isQrImageFormat = (value: unknown): value is QrImageFormat =>
  typeof value === "string" &&
  (QR_IMAGE_FORMATS as readonly string[]).includes(value);

/** The GET /qr query for `data` in `format` with the chosen options. */
export function buildQrImageQuery(
  data: string,
  format: QrImageFormat,
  options: QrImageOptions = {}
): Record<string, string> {
  if (!data) throw new Error("Enter the text or URL to encode.");
  if (data.length > DATA_MAX_LENGTH) {
    throw new Error(
      `The data is ${data.length} characters long; a QR image can hold up to ${DATA_MAX_LENGTH}.`
    );
  }
  const query: Record<string, string> = { data, format };
  for (const [option, param] of Object.entries(QUERY_NAMES) as [
    keyof typeof QUERY_NAMES,
    string,
  ][]) {
    const value = options[option];
    if (value === undefined || value === null || value === "") continue;
    if (COLOR_OPTIONS.has(option)) {
      const color = String(value).trim();
      if (!HEX_COLOR.test(color)) {
        throw new Error(
          `"${color}" isn't a hex color. Use a value like #111827.`
        );
      }
      // Hex without `#`, so image URLs stay readable.
      query[param] = color.replace(/^#/, "");
      continue;
    }
    query[param] = String(value);
  }
  // An empty label hides it, so send it whenever the option is set.
  if (options.frameText !== undefined) {
    if (options.frameText.length > FRAME_TEXT_MAX_LENGTH) {
      throw new Error(
        `Frame text can be up to ${FRAME_TEXT_MAX_LENGTH} characters.`
      );
    }
    query.frameText = options.frameText;
  }
  return query;
}

/** The image's URL: it renders the same image with no key, so it can go into an <img> tag. */
export function qrImageUrl(
  baseUrl: string,
  query: Record<string, string>
): string {
  return `${baseUrl}/qr?${new URLSearchParams(query).toString()}`;
}

const MIME_TYPES: Record<QrImageFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  eps: "application/postscript",
};

/** File name (with the format's extension) and MIME type of the image. */
export function qrImageFile(
  format: QrImageFormat,
  fileName?: string
): { fileName: string; mimeType: string; fileExtension: string } {
  const name = fileName?.trim() || "qr-code";
  const extension = `.${format}`;
  return {
    fileName: name.toLowerCase().endsWith(extension)
      ? name
      : `${name}${extension}`,
    mimeType: MIME_TYPES[format],
    fileExtension: format,
  };
}
