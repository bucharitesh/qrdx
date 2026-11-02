import "server-only";

import {
  APICallError,
  generateImage,
  generateText,
  NoImageGeneratedError,
  RetryError,
} from "ai";
import {
  createQRArtImage,
  type DecodedImage,
  decodePNGPixels,
  QRCodeSVG,
  type QRPropsSVG,
  scanQRPixels,
} from "qrdx";
import { createElement } from "react";
import {
  type AIArtVariant,
  ART_IMAGE_SIZE,
} from "@/components/sections/ai-art/config";
import { HttpError } from "@/lib/error-response";
import { rasterizeImage, serializeQrSvg } from "@/lib/qr-render";
import { logError } from "@/lib/shared";
import { AI_MODELS, type ArtModelChoice, artProviderOptions } from "./models";
import { aiGateway } from "./providers";

// AI QR art in four steps, all on the server:
// 1. Draw the code as a plain black-on-white QR (level H, square modules, a
//    wide quiet zone): the control image.
// 2. The art model (lib/ai/models.ts, through Vercel AI Gateway) restyles it,
//    told to keep the module grid, the finder eyes and the quiet zone (plus
//    an optional reference image for colors or a logo).
// 3. Decode the model's image with jsQR, as it is and through qrdx's
//    phone-camera model. If it decodes to the exact content, deliver it.
// 4. Otherwise blend it into the code with qrdx's Image QR (halftone) art
//    mode on the same module grid, which only corrects the modules that would
//    read wrong, and check that again. Nothing that fails is delivered.

/** Light border around the control code, in modules (the spec minimum is 4). */
const CONTROL_QUIET_ZONE_MODULES = 6;
/** Stays under the route's maxDuration, leaving time for the scan check. */
const ART_MODEL_TIMEOUT_MS = 45_000;
/** Largest image a response carries (Vercel caps responses at 4.5 MB). */
const MAX_DELIVERED_DATA_URL_LENGTH = 4_000_000;
/** Seeds stay in a signed 32-bit integer (Gemini's range). */
const SEED_RANGE = 2 ** 31;

/** Plain props of the control code; the blend reuses them with `art`. */
function controlProps(text: string): QRPropsSVG {
  return {
    value: text,
    level: "H",
    size: ART_IMAGE_SIZE,
    margin: CONTROL_QUIET_ZONE_MODULES,
    fgColor: "#000000",
    bgColor: "#ffffff",
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  };
}

const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const dataUrl = (bytes: Uint8Array, mediaType: string) =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;

async function renderPng(
  src: string,
): Promise<{ png: Uint8Array; pixels: DecodedImage }> {
  const png = new Uint8Array(await rasterizeImage(src, ART_IMAGE_SIZE));
  const pixels = await decodePNGPixels(png);
  if (!pixels) throw new Error("Could not read the rendered PNG");
  return { png, pixels };
}

// ── Control image ──────────────────────────────────────────────────────────

export interface ControlImage {
  /** PNG bytes, ART_IMAGE_SIZE square */
  png: Uint8Array;
  /** Modules across the code itself, without the quiet zone */
  modules: number;
}

/**
 * Renders the image the art model restyles: the code in black on white with error
 * correction H, square modules and a wide quiet zone, decoded once to make
 * sure it holds `text`.
 */
export async function renderControlImage(text: string): Promise<ControlImage> {
  const svg = serializeQrSvg(createElement(QRCodeSVG, controlProps(text)));
  const { png, pixels } = await renderPng(svgDataUrl(svg));
  const scan = await scanQRPixels(pixels, text, { sizes: [] });
  if (!(scan.passed && scan.version)) {
    throw new Error("The control QR code doesn't decode");
  }
  return { png, modules: 17 + 4 * scan.version };
}

// ── Prompt ─────────────────────────────────────────────────────────────────

/** The instruction sent with the control image (exported for tests). */
export function buildArtPrompt({
  prompt,
  negativePrompt,
  visibility,
  creativity,
  withReference,
}: {
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  withReference: boolean;
}): string {
  const lines = [
    `Repaint the QR code in the first image as artwork: ${prompt.replace(/[.\s]+$/, "")}.`,
    "",
    "The artwork must still scan as exactly this QR code:",
    "- Keep the image square and the code where it is, at the same size, on the same grid. Don't move, add, remove, rotate or merge modules.",
    "- Keep the three large square finder patterns in the corners and the small alignment square solid, dark and clearly visible.",
    "- Every dark module must stay clearly darker than the light modules next to it. Paint the scene into the modules themselves, through color, texture and light, so the dark and light pattern stays intact.",
    "- Keep the light border around the code (the quiet zone) light and free of detail.",
    withReference
      ? "- No text, letters, signatures or watermarks."
      : "- No text, letters, logos, signatures or watermarks.",
    "",
    visibility >= 70
      ? "Favor the code: dark modules close to black and light modules close to white, with the scene as color and texture inside them."
      : visibility >= 35
        ? "Balance the two: the scene should be rich and easy to see, and the module pattern obvious at a glance."
        : "Favor the scene: let its light and shadow form the modules, but keep every module clearly dark or light.",
  ];
  if (creativity <= 30) lines.push("Follow the description literally.");
  if (creativity >= 70) {
    lines.push("Interpret the description freely and imaginatively.");
  }
  if (withReference) {
    lines.push(
      "The second image is a reference: carry over its colors, shapes or logo where they fit, without covering the finder patterns.",
    );
  }
  if (negativePrompt) {
    lines.push(`Avoid: ${negativePrompt.replace(/[.\s]+$/, "")}.`);
  }
  return lines.join("\n");
}

/** Image QR blend intensity for a QR visibility (exported for tests). */
export function visibilityToBlendIntensity(visibility: number): number {
  const t = Math.min(Math.max(visibility, 0), 100) / 100;
  return Math.round((0.9 - 0.4 * t) * 100) / 100;
}

// ── Art model ──────────────────────────────────────────────────────────────

export interface ArtModelRequest {
  prompt: string;
  /** The control image first, then the reference (PNG/JPEG bytes) */
  images: Uint8Array[];
  seed: number;
  abortSignal: AbortSignal;
}

export interface ArtModelImage {
  data: Uint8Array;
  mediaType: string;
  /** The response's provider metadata (the gateway's cost, generation id) */
  providerMetadata?: Record<string, unknown>;
}

/** One image model call (tests pass a fake). */
export type ArtImageModel = (
  request: ArtModelRequest,
) => Promise<ArtModelImage>;

/**
 * A multimodal LLM that answers with image files (Gemini image models): the
 * prompt and images go in as one user message, and the last image file that
 * comes back is the artwork.
 */
function filesArtModel(choice: ArtModelChoice): ArtImageModel {
  return async ({ prompt, images, seed, abortSignal }) => {
    const result = await generateText({
      model: aiGateway()(choice.model),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            // The exact image type is read from the bytes.
            ...images.map((data) => ({
              type: "file" as const,
              data,
              mediaType: "image",
            })),
          ],
        },
      ],
      seed: seed % SEED_RANGE,
      providerOptions: artProviderOptions(choice),
      maxRetries: 1,
      abortSignal,
    });
    const image = result.files
      .filter((file) => file.mediaType.startsWith("image/"))
      .at(-1);
    if (!image) {
      throw new NoImageGeneratedError({
        message: "The model's response had no image",
      });
    }
    return {
      data: image.uint8Array,
      mediaType: image.mediaType,
      providerMetadata: result.providerMetadata,
    };
  };
}

/** An image model (generateImage), with the images as input images. */
function imagesArtModel(choice: ArtModelChoice): ArtImageModel {
  return async ({ prompt, images, seed, abortSignal }) => {
    const result = await generateImage({
      model: aiGateway().image(choice.model),
      prompt: { text: prompt, images },
      ...(choice.size ? { size: choice.size } : {}),
      ...(choice.aspectRatio ? { aspectRatio: choice.aspectRatio } : {}),
      seed: seed % SEED_RANGE,
      providerOptions: artProviderOptions(choice),
      maxRetries: 1,
      abortSignal,
    });
    const image = result.images.at(-1) ?? result.image;
    return {
      data: image.uint8Array,
      mediaType: image.mediaType,
      providerMetadata: result.providerMetadata,
    };
  };
}

/** The pipeline's model call for an art model choice (the eval passes others). */
export function artModelFor(choice: ArtModelChoice): ArtImageModel {
  return choice.output === "files"
    ? filesArtModel(choice)
    : imagesArtModel(choice);
}

/** The configured art model (AI_MODELS.art) through the gateway. */
export const gatewayArtModel: ArtImageModel = artModelFor(AI_MODELS.art);

/**
 * The HTTP status of a failed call: APICallError from a provider, or the
 * gateway's own errors, which carry `statusCode` too (GatewayError isn't
 * exported by "ai").
 */
function errorStatus(error: unknown): number | undefined {
  if (APICallError.isInstance(error)) return error.statusCode;
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

async function callModel(
  model: ArtImageModel,
  request: Omit<ArtModelRequest, "abortSignal">,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<ArtModelImage> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const abortSignal = AbortSignal.any([signal, deadline]);
  try {
    return await model({ ...request, abortSignal });
  } catch (error) {
    if (signal.aborted) throw error;
    if (deadline.aborted) {
      throw new HttpError(
        504,
        "AI_ART_TIMEOUT",
        "The image model took too long. No AI credit was used, please try again.",
      );
    }
    // The AI SDK wraps the last failure when its retry gives up.
    const cause = RetryError.isInstance(error) ? error.lastError : error;
    const status = errorStatus(cause);
    // Only the message: the request body holds the prompt and images.
    logError(error as Error, { action: "generateArtImage", status });
    if (NoImageGeneratedError.isInstance(error)) {
      throw new HttpError(
        502,
        "AI_ART_FAILED",
        "The image model returned no image, which can happen when it declines a prompt. No AI credit was used, please try rewording it.",
      );
    }
    if (status === 429) {
      throw new HttpError(
        503,
        "AI_ART_BUSY",
        "AI art is busy right now. No AI credit was used, please try again in a minute.",
      );
    }
    throw new HttpError(
      502,
      "AI_ART_FAILED",
      "The image model couldn't create this artwork. No AI credit was used, please try again.",
    );
  }
}

// ── Scan check and blend ───────────────────────────────────────────────────

/** The model's image as ART_IMAGE_SIZE square RGBA pixels, plus PNG bytes. */
async function readModelImage(
  image: ArtModelImage,
): Promise<{ png: Uint8Array; pixels: DecodedImage }> {
  if (image.mediaType === "image/png") {
    const pixels = await decodePNGPixels(image.data);
    if (pixels?.width === ART_IMAGE_SIZE && pixels.height === ART_IMAGE_SIZE) {
      return { png: image.data, pixels };
    }
  }
  try {
    // Other formats and sizes are redrawn at the delivered size.
    return await renderPng(dataUrl(image.data, image.mediaType));
  } catch (error) {
    logError(error as Error, {
      action: "readArtImage",
      mediaType: image.mediaType,
    });
    throw new HttpError(
      502,
      "AI_ART_FAILED",
      "The image model returned an image QRdx couldn't read. No AI credit was used, please try again.",
    );
  }
}

/** The square of `pixels` from (`left`, `top`), `side` px wide. */
function crop(
  pixels: DecodedImage,
  left: number,
  top: number,
  side: number,
): DecodedImage {
  const data = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) {
    const from = ((top + y) * pixels.width + left) * 4;
    data.set(pixels.data.subarray(from, from + side * 4), y * side * 4);
  }
  return { width: side, height: side, data };
}

const luma = (r: number, g: number, b: number) =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hex = (channels: number[]) =>
  `#${channels
    .map((c) =>
      Math.round(Math.min(Math.max(c, 0), 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/**
 * Dark and light colors for the blend, from the artwork's own darkest and
 * lightest tenths, pushed far enough apart to scan (luma ≤ 0.2 and ≥ 0.86).
 */
function blendPalette(pixels: DecodedImage): { fg: string; bg: string } {
  const samples: [number, number, number, number][] = [];
  for (let i = 0; i < pixels.data.length; i += 4 * 7) {
    const r = pixels.data[i] as number;
    const g = pixels.data[i + 1] as number;
    const b = pixels.data[i + 2] as number;
    samples.push([luma(r, g, b), r, g, b]);
  }
  samples.sort((a, b) => a[0] - b[0]);
  const tenth = Math.max(1, Math.floor(samples.length / 10));
  const mean = (list: typeof samples) =>
    [1, 2, 3].map(
      (c) => list.reduce((sum, s) => sum + (s[c] as number), 0) / list.length,
    );
  let dark = mean(samples.slice(0, tenth));
  let light = mean(samples.slice(-tenth));
  const darkLuma = luma(
    dark[0] as number,
    dark[1] as number,
    dark[2] as number,
  );
  if (darkLuma > 0.2) dark = dark.map((c) => (c * 0.2) / darkLuma);
  const lightLuma = luma(
    light[0] as number,
    light[1] as number,
    light[2] as number,
  );
  if (lightLuma < 0.86) {
    const t = (0.86 - lightLuma) / (1 - lightLuma);
    light = light.map((c) => c + (255 - c) * t);
  }
  return { fg: hex(dark), bg: hex(light) };
}

/**
 * Blends the model's image into the code with qrdx's Image QR art on the
 * control's module grid, then checks the result. Null when no strength scans.
 */
async function blendArt({
  text,
  pixels,
  control,
  visibility,
}: {
  text: string;
  pixels: DecodedImage;
  control: ControlImage;
  visibility: number;
}): Promise<Uint8Array | null> {
  const cells = control.modules + 2 * CONTROL_QUIET_ZONE_MODULES;
  const modulePx = ART_IMAGE_SIZE / cells;
  // The art covers the code area only, so it lines up module for module.
  const left = Math.round(CONTROL_QUIET_ZONE_MODULES * modulePx);
  const side = Math.round(control.modules * modulePx);
  const area = crop(pixels, left, left, side);
  const image = createQRArtImage(area);
  const { fg, bg } = blendPalette(area);
  // A second, gentler try shows the code more strongly.
  for (const intensity of [visibilityToBlendIntensity(visibility), 0.4]) {
    const svg = serializeQrSvg(
      createElement(QRCodeSVG, {
        ...controlProps(text),
        fgColor: fg,
        bgColor: bg,
        art: { mode: "halftone", variant: "color", image, intensity },
      }),
    );
    const blend = await renderPng(svgDataUrl(svg));
    if ((await scanQRPixels(blend.pixels, text)).passed) return blend.png;
  }
  return null;
}

// ── One variant ────────────────────────────────────────────────────────────

/**
 * Generates one AI art image that is verified to decode to `text`. Throws an
 * HttpError (its message says no credit was used) when nothing scannable came
 * back; the caller refunds the reserved credit.
 */
export async function generateArtVariant({
  text,
  prompt,
  negativePrompt,
  visibility,
  creativity,
  seed,
  reference,
  control,
  signal,
  model = gatewayArtModel,
  timeoutMs = ART_MODEL_TIMEOUT_MS,
}: {
  text: string;
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  seed: number;
  /** An uploaded PNG/JPEG data URL (never a remote URL) */
  reference?: string;
  control: ControlImage;
  signal: AbortSignal;
  model?: ArtImageModel;
  /** How long the model may take before the request fails */
  timeoutMs?: number;
}): Promise<AIArtVariant> {
  const images = [control.png];
  if (reference) {
    images.push(
      new Uint8Array(
        Buffer.from(reference.slice(reference.indexOf(",") + 1), "base64"),
      ),
    );
  }
  const output = await callModel(
    model,
    {
      prompt: buildArtPrompt({
        prompt,
        negativePrompt,
        visibility,
        creativity,
        withReference: Boolean(reference),
      }),
      images,
      seed,
    },
    signal,
    timeoutMs,
  );
  const art = await readModelImage(output);

  // Both are PNGs: the model's own, or redrawn from its JPEG or WebP.
  const blended = !(await scanQRPixels(art.pixels, text)).passed;
  const png = blended
    ? await blendArt({ text, pixels: art.pixels, control, visibility })
    : art.png;
  if (!png) {
    throw new HttpError(
      502,
      "AI_ART_UNSCANNABLE",
      "This artwork didn't pass the scan check, so it wasn't delivered. No AI credit was used, please try again or raise QR visibility.",
    );
  }
  const imageUrl = dataUrl(png, "image/png");
  if (imageUrl.length > MAX_DELIVERED_DATA_URL_LENGTH) {
    throw new HttpError(
      502,
      "AI_ART_FAILED",
      "The image came back too large to send. No AI credit was used, please try again.",
    );
  }
  return {
    imageUrl,
    width: ART_IMAGE_SIZE,
    height: ART_IMAGE_SIZE,
    seed,
    blended,
  };
}
