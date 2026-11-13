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
  type ArtMode,
} from "@/components/sections/ai-art/config";
import { HttpError } from "@/lib/error-response";
import { rasterizeImage, serializeQrSvg } from "@/lib/qr-render";
import { logError } from "@/lib/shared";
import {
  type BlendStyle,
  CODE_BLEND_STYLE,
  encodePng,
  findLeastBlend,
  leastBlendBounds,
  type ModuleGrid,
  type QRModuleMap,
  readModuleMap,
  SCENE_BLEND_STYLE,
} from "./art-blend";
import { AI_MODELS, type ArtModelChoice, artProviderOptions } from "./models";
import { aiGateway } from "./providers";

// AI QR art in four steps, all on the server:
// 1. Draw the code as a plain black-on-white QR (level H, square modules, a
//    wide quiet zone): the control image. In scene and photo modes the code
//    is smaller than the image, with a thin light margin, on a flat canvas
//    the model replaces with the scene, or on the user's photo.
// 2. The art model (lib/ai/models.ts, through Vercel AI Gateway) restyles it,
//    told to keep the module grid, flat finder eyes and a plain quiet zone
//    (plus an optional reference image for colors or a logo).
// 3. Decode the model's image with jsQR, as it is and through qrdx's
//    phone-camera model. If it decodes to the exact content, deliver it
//    untouched (unless QR visibility asks for a stronger code).
// 4. Otherwise find the least blend (./art-blend.ts): the lowest strength at
//    which strengthening the finders, the quiet zone and then the modules,
//    on the grid where the model drew them, makes it scan. Only when no
//    strength QR visibility allows works, or the model didn't draw this code
//    at all, does the Image QR (halftone) blend redraw the code's square as
//    a code (the whole image in code mode). Nothing that fails is delivered.

/** Light border around the control code, in modules (the spec minimum is 4). */
const CONTROL_QUIET_ZONE_MODULES = 6;
/** Stays under the route's maxDuration, leaving time for the scan check. */
export const ART_MODEL_TIMEOUT_MS = 45_000;
/** How long the least-blend search may take before the Image QR fallback. */
const LEAST_BLEND_BUDGET_MS = 8000;
/** Largest image a response carries (Vercel caps responses at 4.5 MB). */
const MAX_DELIVERED_DATA_URL_LENGTH = 4_000_000;
/** Seeds stay in a signed 32-bit integer (the Gemini image models' range). */
const SEED_RANGE = 2 ** 31;

/** The seed for a model that follows one; nothing for one that ignores it. */
const seedFor = (choice: ArtModelChoice, seed: number) =>
  choice.supportsSeed ? { seed: seed % SEED_RANGE } : {};

/** Plain props of the control code; the blend reuses them with `art`. */
export function controlProps(text: string): QRPropsSVG {
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
/** The bytes of an uploaded (base64) data: URL. */
const dataUrlBytes = (url: string) =>
  new Uint8Array(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));

export async function renderPng(
  src: string,
  size = ART_IMAGE_SIZE,
): Promise<{ png: Uint8Array; pixels: DecodedImage }> {
  const png = new Uint8Array(await rasterizeImage(src, size));
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
  /** Every module's value and kind, read from the rendered control */
  map: QRModuleMap;
  /** Where the code's modules are in `png`, in pixels */
  grid: Omit<ModuleGrid, "fit">;
  /** "code": the code fills the image; "scene" and "photo": it sits in it */
  mode: ArtMode;
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
  const modules = 17 + 4 * scan.version;
  const pitch = ART_IMAGE_SIZE / (modules + 2 * CONTROL_QUIET_ZONE_MODULES);
  const edge = CONTROL_QUIET_ZONE_MODULES * pitch;
  return {
    png,
    modules,
    map: readModuleMap(pixels, modules, CONTROL_QUIET_ZONE_MODULES),
    grid: { left: edge, top: edge, pitch },
    mode: "code",
  };
}

/** Where the control image has its modules, in pixels. */
export function controlGrid(control: ControlImage): Omit<ModuleGrid, "fit"> {
  return control.grid;
}

/** Where the code sits in a scene or photo control image. */
export interface SceneLayout {
  /** The code's width (without its margin) as a share of the image's */
  size: number;
  /** The code's center, as shares of the image's width and height */
  x: number;
  y: number;
  /** The light margin around the code, in modules */
  margin: number;
  /** Luma (0–255) of the dark modules, and of the light ones and the margin */
  dark: number;
  /** null: light modules and margin show the canvas (or photo) */
  light: number | null;
  /** How much the code covers what's under it, 0–1 (1: solid) */
  opacity: number;
}

/**
 * The scene and photo layout, from scripts/ai/art-eval.ts: the code at
 * about two thirds of the image, centered, with a thin light margin.
 */
export const SCENE_LAYOUT: SceneLayout = {
  size: 0.64,
  x: 0.5,
  y: 0.5,
  margin: 1.5,
  dark: 0,
  light: 255,
  opacity: 1,
};

/**
 * Photo mode's layout: the code over the photo at 85%, so the model sees
 * the subject under it and keeps it (at 100% it painted a new one).
 */
export const PHOTO_LAYOUT: SceneLayout = { ...SCENE_LAYOUT, opacity: 0.85 };

/** The flat canvas around the code in scene mode, which the model paints over. */
const SCENE_CANVAS: readonly [number, number, number] = [150, 150, 150];

/**
 * Where a code of `modules` sits in a scene control (exported for tests):
 * a whole number of pixels per module, so module edges stay crisp, with the
 * code and its margin kept inside the image.
 */
export function sceneGrid(
  modules: number,
  layout: SceneLayout = SCENE_LAYOUT,
): Omit<ModuleGrid, "fit"> {
  const pitch = Math.max(
    1,
    Math.floor((layout.size * ART_IMAGE_SIZE) / modules),
  );
  const side = pitch * modules;
  const edge = Math.ceil(layout.margin * pitch);
  const place = (center: number) =>
    Math.min(
      Math.max(Math.round(center * ART_IMAGE_SIZE - side / 2), edge),
      ART_IMAGE_SIZE - side - edge,
    );
  return { left: place(layout.x), top: place(layout.y), pitch };
}

/**
 * The control for scene and photo modes, from the code's control: the same
 * modules on `sceneGrid`, black on a thin white margin, over a flat grey
 * canvas or, in photo mode, the photo itself (ART_IMAGE_SIZE square).
 */
export function sceneControl(
  control: ControlImage,
  {
    mode = "scene",
    photo,
    layout = SCENE_LAYOUT,
  }: {
    mode?: Exclude<ArtMode, "code">;
    photo?: DecodedImage;
    layout?: SceneLayout;
  } = {},
): ControlImage {
  const size = ART_IMAGE_SIZE;
  const { map } = control;
  const grid = sceneGrid(control.modules, layout);
  const { left, top, pitch } = grid;
  const data = new Uint8Array(size * size * 4);
  if (photo && photo.width === size && photo.height === size) {
    data.set(photo.data);
  } else {
    for (let i = 0; i < data.length; i += 4) {
      data.set(SCENE_CANVAS, i);
      data[i + 3] = 255;
    }
  }
  const fill = (x0: number, y0: number, w: number, h: number, v: number) => {
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
        const i = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          const under = data[i + c] as number;
          data[i + c] = Math.round(under + (v - under) * layout.opacity);
        }
        data[i + 3] = 255;
      }
    }
  };
  const edge = Math.ceil(layout.margin * pitch);
  const side = pitch * map.size;
  if (layout.light !== null) {
    fill(
      left - edge,
      top - edge,
      side + 2 * edge,
      side + 2 * edge,
      layout.light,
    );
  }
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      if (map.dark[y * map.size + x]) {
        fill(left + x * pitch, top + y * pitch, pitch, pitch, layout.dark);
      }
    }
  }
  const pixels = { width: size, height: size, data };
  return { png: encodePng(pixels), modules: control.modules, map, grid, mode };
}

// ── Prompt ─────────────────────────────────────────────────────────────────

/**
 * Extra rules per art model (gateway id), for what each got wrong in
 * scripts/ai/art-eval.ts. GPT Image 2's is the one users get (it's the art
 * model): it redrew the code about 4% larger, off-center, in 2 of 6 images
 * of the first eval. The others are for the eval's candidates: the Gemini
 * models painted scenes out to the image's edges, and Flash drew one city's
 * finders as 3D blocks half again their size.
 */
const MODEL_PROMPT_RULES: Record<string, string> = {
  "openai/gpt-image-2":
    "- Don't zoom, crop or re-center: the code covers exactly the same pixels as in the first image.",
  "google/gemini-nano-banana-2.1":
    "- Keep it flat and front-on, like a print: no perspective, depth or 3D blocks, and nothing that rises above or overlaps the code.",
  "google/gemini-3.1-flash-image":
    "- Keep it flat and front-on, like a print: no perspective, depth or 3D blocks, and nothing that rises above or overlaps the code.",
};

/** How the photo reaches the model in photo mode. */
export type PhotoInput =
  /** The control is the photo with the code on it (the default) */
  | "composite"
  /** The control is the code on a flat canvas; the photo is the next image */
  | "second";

/** The default photo input, from scripts/ai/art-eval.ts. */
export const PHOTO_INPUT: PhotoInput = "composite";

const sentence = (text: string) => text.replace(/[.\s]+$/, "");

/** The instruction sent with the control image (exported for tests). */
export function buildArtPrompt({
  prompt,
  negativePrompt,
  visibility,
  creativity,
  withReference,
  mode = "code",
  photoInput = PHOTO_INPUT,
  model = AI_MODELS.art.model,
}: {
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  withReference: boolean;
  /** How the code sits in the artwork */
  mode?: ArtMode;
  /** Photo mode: how the photo is sent */
  photoInput?: PhotoInput;
  /** Gateway id of the art model, for its own rules */
  model?: string;
}): string {
  const modelRule = MODEL_PROMPT_RULES[model];
  const noText = withReference
    ? "- No text, letters, signatures or watermarks."
    : "- No text, letters, logos, signatures or watermarks.";
  const lines =
    mode === "code"
      ? [
          `Repaint the QR code in the first image as artwork: ${sentence(prompt)}.`,
          "",
          "The artwork must still scan as exactly this QR code:",
          "- Keep the image square and the code exactly where it is, at the same size, on the same grid. Don't move, resize, add, remove, rotate or merge modules.",
          "- Draw the three large finder patterns in the corners and the small alignment square flat and crisp, at exactly their current size: a solid dark ring, a clean light ring and a solid dark center, with straight edges and no scene painted inside them.",
          "- Every dark module must stay clearly darker than the light modules next to it. Paint the scene into the modules themselves, through color, shading and light, so the dark and light pattern stays intact. Keep detail inside a module soft, without fine speckles or thin lines of the opposite tone.",
          "- Keep the border around the code (the quiet zone) plain, light and free of detail: the scene stays inside the code's square.",
          ...(modelRule ? [modelRule] : []),
          noText,
          "",
          visibility >= 70
            ? "Favor the code: dark modules close to black and light modules close to white, with the scene as color and texture inside them."
            : visibility >= 35
              ? "Balance the two: the scene should be rich and easy to see, and the module pattern obvious at a glance."
              : "Favor the scene: let its light and shadow form the modules, but keep every module clearly dark or light.",
        ]
      : [
          ...(mode === "scene"
            ? [
                `Paint one full-bleed picture that fills the whole square, edge to edge: ${sentence(prompt)}.`,
                "Replace the flat grey background completely. The QR code in the first image becomes part of something in the picture that suits it, such as a building's facade with lit and dark windows, a tiled floor or wall, a mosaic, a garden of clipped hedges and pale gravel, or a city's windows at night.",
                "Don't draw it as a printed QR code, a sign, a panel or a screen, and don't put a frame or border around it: the scene runs through the code's square, and every module is made of that thing's own materials, light and colors, so someone sees the picture first and the code second.",
              ]
            : photoInput === "composite"
              ? [
                  `The first image is a photo with a QR code placed on it. Paint the code into the photo so it belongs there: ${sentence(prompt)}.`,
                  "Keep the photo's subject, composition, colors and light. Change only what the code needs to become part of the photo where it sits, such as a pattern painted on a wall or surface, in the sky or water, or on clothing.",
                ]
              : [
                  `The second image is a photo. Repaint it with the QR code from the first image painted into it: ${sentence(prompt)}.`,
                  "Keep the photo's subject, composition, colors and light. The code goes exactly where it is in the first image, at the same size, as part of the photo there, such as a pattern painted on a wall or surface, in the sky or water, or on clothing.",
                ]),
          "",
          "The picture must still scan as exactly this QR code:",
          "- Keep the image square and the code at exactly the same pixels and size as in the first image, on the same grid, flat and facing the viewer. Don't move, resize, tilt, add, remove, rotate or merge modules.",
          "- Draw the three large finder patterns in the code's corners as part of the picture (dark window frames, framed panels, stones), in its darkest tone, at exactly their current size: a solid dark square ring, a clean light ring and a solid dark center, with straight edges.",
          "- Every dark module must stay clearly darker than the light modules next to it, in the picture's own colors, never flat black and white: dark modules in its deepest shadows and darkest materials, light modules in its brightest light and palest materials. Keep detail inside a module soft, without fine speckles or thin lines of the opposite tone.",
          "- Right around the code, keep the scene a little lighter and calmer for about one module's width, without drawing a frame.",
          ...(modelRule ? [modelRule] : []),
          noText,
          "",
          visibility >= 70
            ? "Favor the code: dark modules close to black and light modules close to white, in the picture's colors."
            : visibility >= 35
              ? "Balance the two: someone should see a picture first, and a clear code as soon as they look for it."
              : "Favor the picture: weave the code into it, but keep every module clearly dark or light.",
        ];
  if (creativity <= 30) lines.push("Follow the description literally.");
  if (creativity >= 70) {
    lines.push("Interpret the description freely and imaginatively.");
  }
  if (withReference) {
    const which =
      mode === "photo" && photoInput === "second" ? "third" : "second";
    lines.push(
      `The ${which} image is a reference: carry over its colors, shapes or logo where they fit, without covering the finder patterns.`,
    );
  }
  if (negativePrompt) {
    lines.push(`Avoid: ${sentence(negativePrompt)}.`);
  }
  return lines.join("\n");
}

/**
 * Image QR blend intensity for a QR visibility, for the last-resort blend
 * (exported for tests).
 */
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
 * A multimodal LLM that answers with image files (the Gemini image models): the
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
      ...seedFor(choice, seed),
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
      ...seedFor(choice, seed),
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

export async function callModel(
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
export async function readModelImage(
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

/** Light border of the Image QR blend in scene and photo modes, in modules. */
const REGION_BLEND_QUIET_ZONE_MODULES = 2;

/** `patch` drawn over a copy of `pixels` at (`left`, `top`), clipped. */
function paste(
  pixels: DecodedImage,
  patch: DecodedImage,
  left: number,
  top: number,
): DecodedImage {
  const data = new Uint8Array(pixels.data);
  const x0 = Math.max(0, left);
  const x1 = Math.min(pixels.width, left + patch.width);
  for (
    let y = Math.max(0, top);
    y < Math.min(pixels.height, top + patch.height);
    y++
  ) {
    const from = ((y - top) * patch.width + (x0 - left)) * 4;
    data.set(
      patch.data.subarray(from, from + (x1 - x0) * 4),
      (y * pixels.width + x0) * 4,
    );
  }
  return { width: pixels.width, height: pixels.height, data };
}

/**
 * The Image QR blend, the last resort: redraws the code with qrdx's Image QR
 * art on the control's module grid, the model's image showing through it,
 * then checks the result. In code mode that's the whole image; in scene and
 * photo modes only the code's square and a thin border, over the picture.
 * Null when no strength scans. (The eval runs it on every image to compare
 * with the least blend.)
 */
export async function blendImageQR({
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
  const { left, top, pitch } = control.grid;
  // The art covers the code area only, so it lines up module for module.
  const side = Math.round(control.modules * pitch);
  const area = crop(pixels, Math.round(left), Math.round(top), side);
  const image = createQRArtImage(area);
  const { fg, bg } = blendPalette(area);
  const region = control.mode !== "code";
  const quiet = region
    ? REGION_BLEND_QUIET_ZONE_MODULES
    : CONTROL_QUIET_ZONE_MODULES;
  const size = region
    ? Math.round((control.modules + 2 * quiet) * pitch)
    : ART_IMAGE_SIZE;
  // A second, gentler try shows the code more strongly.
  for (const intensity of [visibilityToBlendIntensity(visibility), 0.4]) {
    const svg = serializeQrSvg(
      createElement(QRCodeSVG, {
        ...controlProps(text),
        size,
        margin: quiet,
        fgColor: fg,
        bgColor: bg,
        art: { mode: "halftone", variant: "color", image, intensity },
      }),
    );
    const blend = await renderPng(svgDataUrl(svg), size);
    if (!region) {
      if ((await scanQRPixels(blend.pixels, text)).passed) return blend.png;
      continue;
    }
    const offset = Math.round(quiet * pitch);
    const whole = paste(
      pixels,
      blend.pixels,
      Math.round(left) - offset,
      Math.round(top) - offset,
    );
    if ((await scanQRPixels(whole, text)).passed) return encodePng(whole);
  }
  return null;
}

/**
 * What the pipeline delivered before the least blend, for the eval to compare
 * with: the model's image when it scanned as drawn, otherwise the Image QR
 * blend. Null when neither scanned.
 */
export async function oldPipelineImage({
  text,
  image,
  control,
  visibility,
}: {
  text: string;
  image: ArtModelImage;
  control: ControlImage;
  visibility: number;
}): Promise<Uint8Array | null> {
  const art = await readModelImage(image);
  if ((await scanQRPixels(art.pixels, text)).passed) return art.png;
  return blendImageQR({ text, pixels: art.pixels, control, visibility });
}

/** `pixels` over white where they're not opaque (scanners see it that way). */
function flattenOnWhite(pixels: DecodedImage): DecodedImage | null {
  const { data } = pixels;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  if (opaque) return null;
  const flat = new Uint8Array(data);
  for (let i = 0; i < flat.length; i += 4) {
    const a = (flat[i + 3] as number) / 255;
    for (let c = 0; c < 3; c++) {
      flat[i + c] = Math.round((flat[i + c] as number) * a + 255 * (1 - a));
    }
    flat[i + 3] = 255;
  }
  return { width: pixels.width, height: pixels.height, data: flat };
}

/**
 * The delivery gate on the exact bytes delivered: the PNG decodes back to
 * pixels that scanQRPixels reads as `text`, as drawn and through the
 * phone-camera model.
 */
async function passesGate(png: Uint8Array, text: string): Promise<boolean> {
  const pixels = await decodePNGPixels(png);
  return Boolean(pixels && (await scanQRPixels(pixels, text)).passed);
}

export interface Delivery {
  png: Uint8Array;
  blend: AIArtVariant["blend"];
  blendStrength: number;
}

/**
 * Makes the model's image scan with as little change as QR visibility
 * allows: as drawn, else the least blend, else (from visibility 50) the
 * Image QR blend. Null when none of them passes the gate.
 */
export async function deliverable({
  text,
  art,
  control,
  visibility,
  signal,
  blendStyle,
}: {
  text: string;
  art: { png: Uint8Array; pixels: DecodedImage };
  control: ControlImage;
  visibility: number;
  signal: AbortSignal;
  blendStyle?: BlendStyle;
}): Promise<Delivery | null> {
  const flat = flattenOnWhite(art.pixels);
  const pixels = flat ?? art.pixels;
  const bounds = leastBlendBounds(visibility);
  if (bounds.floor === 0 && (await scanQRPixels(pixels, text)).passed) {
    return {
      png: flat ? encodePng(flat) : art.png,
      blend: "none",
      blendStrength: 0,
    };
  }
  const least = await findLeastBlend({
    pixels,
    text,
    map: control.map,
    expected: controlGrid(control),
    bounds,
    deadline: Date.now() + LEAST_BLEND_BUDGET_MS,
    signal,
    style:
      blendStyle ??
      (control.mode === "code" ? CODE_BLEND_STYLE : SCENE_BLEND_STYLE),
  });
  if (least) {
    const png = encodePng(least.pixels);
    if (await passesGate(png, text)) {
      return { png, blend: "least", blendStrength: least.strength };
    }
  }
  if (!bounds.imageQRFallback) return null;
  const png = await blendImageQR({ text, pixels, control, visibility });
  return png ? { png, blend: "image-qr", blendStrength: 1 } : null;
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
  mode = "code",
  photo,
  control: codeControl,
  signal,
  model = gatewayArtModel,
  modelId = AI_MODELS.art.model,
  timeoutMs = ART_MODEL_TIMEOUT_MS,
  layout = mode === "photo" ? PHOTO_LAYOUT : SCENE_LAYOUT,
  photoInput = PHOTO_INPUT,
  blendStyle,
}: {
  text: string;
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  seed: number;
  /** An uploaded PNG/JPEG data URL (never a remote URL) */
  reference?: string;
  /** How the code sits in the artwork (config.ts ART_MODES); "code" when unset */
  mode?: ArtMode;
  /** Photo mode: the uploaded PNG/JPEG data URL the code is painted into */
  photo?: string;
  /** The code's control (renderControlImage); scene and photo modes redraw it */
  control: ControlImage;
  signal: AbortSignal;
  model?: ArtImageModel;
  /** Gateway id behind `model`, for its prompt rules */
  modelId?: string;
  /** How long the model may take before the request fails */
  timeoutMs?: number;
  /** Scene and photo modes: where the code sits (the eval tries others) */
  layout?: SceneLayout;
  /** Photo mode: how the photo is sent (the eval tries both) */
  photoInput?: PhotoInput;
  /** The least blend's treatment of the picture (the eval tries others) */
  blendStyle?: BlendStyle;
}): Promise<AIArtVariant> {
  if (mode === "photo" && !photo) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Add a photo to paint the code into",
    );
  }
  // The photo, square at the delivered size; it's never stored or logged.
  const photoPixels =
    mode === "photo" && photo && photoInput === "composite"
      ? (await renderPng(photo)).pixels
      : undefined;
  const control =
    mode === "code"
      ? codeControl
      : sceneControl(codeControl, { mode, photo: photoPixels, layout });
  const images = [control.png];
  if (mode === "photo" && photo && photoInput === "second") {
    images.push(dataUrlBytes(photo));
  }
  if (reference) images.push(dataUrlBytes(reference));
  const output = await callModel(
    model,
    {
      prompt: buildArtPrompt({
        prompt,
        negativePrompt,
        visibility,
        creativity,
        withReference: Boolean(reference),
        mode,
        photoInput,
        model: modelId,
      }),
      images,
      seed,
    },
    signal,
    timeoutMs,
  );
  // A PNG: the model's own, or redrawn from its JPEG or WebP.
  const art = await readModelImage(output);
  const delivery = await deliverable({
    text,
    art,
    control,
    visibility,
    signal,
    blendStyle,
  });
  if (!delivery) {
    throw new HttpError(
      502,
      "AI_ART_UNSCANNABLE",
      "This artwork didn't pass the scan check, so it wasn't delivered. No AI credit was used, please try again or raise QR visibility.",
    );
  }
  const { png, blend, blendStrength } = delivery;
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
    blended: blend !== "none",
    blend,
    blendStrength,
  };
}
