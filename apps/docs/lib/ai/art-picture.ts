import "server-only";

// Scene and photo modes: the picture first, then the code painted into it.
// The picture is the user's photo, or one text-to-image call from the
// description (scene mode, at low quality: it looks the same once the code
// is in). Then the code-mode treatment runs on the square where the code
// goes: the model gets the control code and that square of the picture,
// and repaints the picture as the code, so the modules are made of the
// picture's own content. Only the code and a thin ring of its margin go
// back into the picture, feathered at the seam; everything around it stays
// the picture's own pixels. Then the usual scan check and least blend
// (./art-image.ts deliverVariant), lightening in the picture's own colors.
// Measured by scripts/ai/art-eval-picture.ts.

import { generateImage, generateText, NoImageGeneratedError } from "ai";
import { type DecodedImage, QRCodeSVG } from "qrdx";
import { createElement } from "react";
import sharp from "sharp";
import {
  type AIArtVariant,
  ART_IMAGE_SIZE,
  ART_PHOTO_MAX_BYTES,
} from "@/components/sections/ai-art/config";
import { serializeQrSvg } from "@/lib/qr-render";
import {
  type BlendStyle,
  encodePng,
  type ModuleGrid,
  SCENE_BLEND_STYLE,
} from "./art-blend";
import {
  ART_MODEL_TIMEOUT_MS,
  type ArtImageModel,
  type ArtModelImage,
  type ControlImage,
  callModel,
  controlProps,
  deliverVariant,
  gatewayArtModel,
  readModelImage,
  renderPng,
} from "./art-image";
import { AI_MODELS, type ArtModelChoice, artProviderOptions } from "./models";
import { aiGateway } from "./providers";

const SIZE = ART_IMAGE_SIZE;
const sentence = (text: string) => text.replace(/[.\s]+$/, "");
const pngDataUrl = (png: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// ── Text to image ──────────────────────────────────────────────────────────

export interface PictureRequest {
  prompt: string;
  seed: number;
  abortSignal: AbortSignal;
}

/** One text-to-image call (tests and the eval pass others). */
export type PictureModel = (request: PictureRequest) => Promise<ArtModelImage>;

/**
 * The scene's picture quality on GPT Image 2: "low" was the fastest (about
 * 14 s) and looked the same once the code was painted in; "medium" was slower.
 */
export const PICTURE_QUALITY = "low";

/** The art model as a text-to-image model; `quality` for GPT Image 2. */
export function pictureModelFor(
  choice: ArtModelChoice = AI_MODELS.art,
  { quality = PICTURE_QUALITY }: { quality?: "low" | "medium" | "high" } = {},
): PictureModel {
  const options = artProviderOptions(choice);
  if (choice.model.startsWith("openai/")) {
    options.openai = { ...(options.openai ?? {}), quality };
  }
  if (choice.output === "files") {
    return async ({ prompt, abortSignal }) => {
      const result = await generateText({
        model: aiGateway()(choice.model),
        prompt,
        providerOptions: options,
        maxRetries: 1,
        abortSignal,
      });
      const image = result.files
        .filter((file) => file.mediaType.startsWith("image/"))
        .at(-1);
      if (!image) {
        throw new NoImageGeneratedError({ message: "No image came back" });
      }
      return {
        data: image.uint8Array,
        mediaType: image.mediaType,
        providerMetadata: result.providerMetadata,
      };
    };
  }
  return async ({ prompt, abortSignal }) => {
    const result = await generateImage({
      model: aiGateway().image(choice.model),
      prompt,
      ...(choice.size ? { size: choice.size } : {}),
      ...(choice.aspectRatio ? { aspectRatio: choice.aspectRatio } : {}),
      providerOptions: options,
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

/** The scene's picture, before any code: full-bleed, from the description. */
export function buildPicturePrompt({
  prompt,
  negativePrompt,
}: {
  prompt: string;
  negativePrompt?: string;
}): string {
  return [
    `Paint one square picture that fills the whole frame, edge to edge: ${sentence(prompt)}.`,
    "Make the middle of the picture rich in detail, with clear light and shadow.",
    "No text, letters, logos, signatures or watermarks.",
    ...(negativePrompt ? [`Avoid: ${sentence(negativePrompt)}.`] : []),
  ].join("\n");
}

// ── Where the code goes ────────────────────────────────────────────────────

/** The code's square in the picture, as shares of the picture. */
export interface PictureRegion {
  /** The square's side (code plus its margin), as a share of the picture's */
  size: number;
  /** Its center */
  x: number;
  y: number;
}

export const PICTURE_REGION: PictureRegion = { size: 0.64, x: 0.5, y: 0.5 };
/** The picture around the code inside the painted square, in modules. */
export const PAINT_MARGIN_MODULES = 2;
/**
 * How much of the painted margin goes back, and the seam's feather, in
 * modules: the model paints the margin paler than the picture, so only a
 * thin ring of it is kept and the picture's own pixels run up to the code.
 */
export const PAINT_KEEP_MODULES = 0.75;
export const PAINT_FEATHER_MODULES = 0.75;

export interface PaintGeometry {
  /** The painted square in the picture, in pixels */
  square: { left: number; top: number; side: number };
  /** Where the code's modules are in the picture */
  grid: Omit<ModuleGrid, "fit">;
}

/** Where a code of `modules` sits in the picture (exported for tests). */
export function paintGeometry(
  modules: number,
  region: PictureRegion = PICTURE_REGION,
  margin = PAINT_MARGIN_MODULES,
): PaintGeometry {
  const side = Math.round(region.size * SIZE);
  const place = (center: number) =>
    Math.min(Math.max(Math.round(center * SIZE - side / 2), 0), SIZE - side);
  const left = place(region.x);
  const top = place(region.y);
  const pitch = side / (modules + 2 * margin);
  return {
    square: { left, top, side },
    grid: { left: left + margin * pitch, top: top + margin * pitch, pitch },
  };
}

/** The control for the painted square: the code with a `margin`-module border. */
export async function renderPaintControl(
  text: string,
  margin = PAINT_MARGIN_MODULES,
): Promise<Uint8Array> {
  const svg = serializeQrSvg(
    createElement(QRCodeSVG, { ...controlProps(text), margin }),
  );
  return (await renderPng(svgDataUrl(svg))).png;
}

// ── Pixels ─────────────────────────────────────────────────────────────────

/** The `side` px square of `pixels` from (`left`, `top`). */
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

/** `pixels` resampled to `size` square. */
async function resize(
  pixels: DecodedImage,
  size: number,
): Promise<DecodedImage> {
  return (await renderPng(pngDataUrl(encodePng(pixels)), size)).pixels;
}

/**
 * `patch` (the square's size) over a copy of `picture` at `square`, fully
 * inside and fading to the picture over its outer `feather` px.
 */
function pasteFeathered(
  picture: DecodedImage,
  patch: DecodedImage,
  square: { left: number; top: number; side: number },
  feather: number,
): DecodedImage {
  const data = new Uint8Array(picture.data);
  const { left, top, side } = square;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const edge = Math.min(x + 0.5, y + 0.5, side - x - 0.5, side - y - 0.5);
      const a = feather > 0 ? Math.min(1, edge / feather) : 1;
      const from = (y * side + x) * 4;
      const to = ((top + y) * picture.width + left + x) * 4;
      for (let c = 0; c < 3; c++) {
        data[to + c] = Math.round(
          (data[to + c] as number) * (1 - a) +
            (patch.data[from + c] as number) * a,
        );
      }
      data[to + 3] = 255;
    }
  }
  return { width: picture.width, height: picture.height, data };
}

// ── Paint ──────────────────────────────────────────────────────────────────

/** Extra rules per art model, as in code mode (./art-image.ts). */
const MODEL_RULES: Record<string, string> = {
  "openai/gpt-image-2":
    "- Don't zoom, crop or re-center: the code covers exactly the same pixels as in the first image.",
};

/** The instruction for painting the code into the picture's square. */
export function buildPaintPrompt({
  prompt,
  negativePrompt,
  visibility,
  creativity,
  withReference,
  model = AI_MODELS.art.model,
}: {
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  withReference: boolean;
  model?: string;
}): string {
  const lines = [
    `Repaint the QR code in the first image as the picture in the second image: ${sentence(prompt)}.`,
    "Keep the second image's subject, composition, colors and light exactly, so the picture carries on through the code: every module is made of the picture's own content, darker or lighter. Don't add new scenery, recolor it or change its style.",
    "",
    "The artwork must still scan as exactly this QR code:",
    "- Keep the image square and the code exactly where it is, at the same size, on the same grid. Don't move, resize, add, remove, rotate or merge modules.",
    "- Draw the three large finder patterns and the small alignment square crisp, at exactly their current size, in the picture's darkest tone: a solid dark ring, a clean light ring and a solid dark center, with straight edges.",
    "- Every dark module must stay clearly darker than the light modules next to it. Paint the picture into the modules themselves, through color, shading and light, so the dark and light pattern stays intact. Keep detail inside a module soft, without fine speckles or thin lines of the opposite tone.",
    "- The border around the code is part of the picture: continue the second image there, matching its edges, a little lighter and calmer. Don't paint a plain, pale or white frame.",
    ...(MODEL_RULES[model] ? [MODEL_RULES[model] as string] : []),
    withReference
      ? "- No text, letters, signatures or watermarks."
      : "- No text, letters, logos, signatures or watermarks.",
    "",
    visibility >= 70
      ? "Favor the code: dark modules close to black and light modules close to white, in the picture's colors."
      : visibility >= 35
        ? "Balance the two: the picture should be easy to see through the code, and the module pattern obvious at a glance."
        : "Favor the picture: let its light and shadow form the modules, but keep every module clearly dark or light.",
  ];
  if (creativity <= 30) lines.push("Follow the description literally.");
  if (creativity >= 70) lines.push("Interpret the description freely.");
  if (withReference) {
    lines.push(
      "The third image is a reference: carry over its colors, shapes or logo where they fit, without covering the finder patterns.",
    );
  }
  if (negativePrompt) lines.push(`Avoid: ${sentence(negativePrompt)}.`);
  return lines.join("\n");
}

export interface PictureArt {
  /** The picture with the code in it, before the scan check */
  art: { png: Uint8Array; pixels: DecodedImage };
  /** Where the code is in `art`, for the scan check and blend */
  control: ControlImage;
  /** The model's answer */
  raw: ArtModelImage;
}

/**
 * "paint": the code painted into `picture` (ART_IMAGE_SIZE square) at
 * `region`, from the code-mode treatment on that square alone.
 */
export async function paintIntoPicture({
  text,
  prompt,
  negativePrompt,
  visibility,
  creativity,
  seed,
  picture,
  codeControl,
  region = PICTURE_REGION,
  margin = PAINT_MARGIN_MODULES,
  keepModules = PAINT_KEEP_MODULES,
  featherModules = PAINT_FEATHER_MODULES,
  reference,
  model = gatewayArtModel,
  modelId = AI_MODELS.art.model,
  signal,
  timeoutMs = ART_MODEL_TIMEOUT_MS,
}: {
  text: string;
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  seed: number;
  picture: DecodedImage;
  codeControl: ControlImage;
  region?: PictureRegion;
  margin?: number;
  /**
   * How much of the painted margin goes back into the picture, in modules
   * (the picture's own pixels are kept beyond it)
   */
  keepModules?: number;
  featherModules?: number;
  reference?: Uint8Array;
  model?: ArtImageModel;
  modelId?: string;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<PictureArt> {
  const { square, grid } = paintGeometry(codeControl.modules, region, margin);
  const area = await resize(
    crop(picture, square.left, square.top, square.side),
    SIZE,
  );
  const control = await renderPaintControl(text, margin);
  const raw = await callModel(
    model,
    {
      prompt: buildPaintPrompt({
        prompt,
        negativePrompt,
        visibility,
        creativity,
        withReference: Boolean(reference),
        model: modelId,
      }),
      images: [control, encodePng(area), ...(reference ? [reference] : [])],
      seed,
    },
    signal,
    timeoutMs,
  );
  const painted = await resize((await readModelImage(raw)).pixels, square.side);
  // Only the code and `keepModules` of its margin; the picture beyond.
  const inset = Math.round(
    (margin - Math.min(keepModules, margin)) * grid.pitch,
  );
  const kept = {
    left: square.left + inset,
    top: square.top + inset,
    side: square.side - 2 * inset,
  };
  const pixels = pasteFeathered(
    picture,
    crop(painted, inset, inset, kept.side),
    kept,
    featherModules * grid.pitch,
  );
  return {
    art: { png: encodePng(pixels), pixels },
    control: {
      png: control,
      modules: codeControl.modules,
      map: codeControl.map,
      grid,
      mode: "scene",
    },
    raw,
  };
}

// ── The picture ────────────────────────────────────────────────────────────

/** The configured art model, as the scene's text-to-image model. */
export const gatewayPictureModel: PictureModel = pictureModelFor();

/** JPEG qualities tried in turn until the picture fits ART_PHOTO_MAX_BYTES. */
const PICTURE_JPEG_QUALITIES = [88, 80, 70];

/**
 * The scene's picture from the description: one low-quality text-to-image
 * call, as a JPEG of at most ART_PHOTO_MAX_BYTES (the model answers with a
 * PNG near 2 MB; the JPEG keeps the sealed picture inside the request body
 * a photo may already use). Errors read like the art call's (no credit used).
 */
export async function makeScenePicture({
  prompt,
  negativePrompt,
  seed,
  signal,
  timeoutMs,
  model = gatewayPictureModel,
}: {
  prompt: string;
  negativePrompt?: string;
  seed: number;
  signal: AbortSignal;
  timeoutMs: number;
  model?: PictureModel;
}): Promise<Uint8Array> {
  const image = await callModel(
    ({ prompt: text, seed: s, abortSignal }) =>
      model({ prompt: text, seed: s, abortSignal }),
    {
      prompt: buildPicturePrompt({ prompt, negativePrompt }),
      images: [],
      seed,
    },
    signal,
    timeoutMs,
  );
  const square = sharp(image.data).resize(SIZE, SIZE, { fit: "cover" });
  for (const quality of PICTURE_JPEG_QUALITIES) {
    const jpeg = await square
      .clone()
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (jpeg.length <= ART_PHOTO_MAX_BYTES) return new Uint8Array(jpeg);
  }
  throw new Error("The scene's picture is too large even as a JPEG");
}

// ── One variant ────────────────────────────────────────────────────────────

const mediaTypeOf = (bytes: Uint8Array) =>
  bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";

/**
 * One scene- or photo-mode image, verified to decode to `text`: the code
 * painted into `picture` (the scene's picture, or the photo's bytes), then
 * the scan check and least blend. Throws an HttpError that says no credit
 * was used when nothing scannable came back.
 */
export async function generatePictureVariant({
  text,
  prompt,
  negativePrompt,
  visibility,
  creativity,
  seed,
  reference,
  picture,
  control,
  signal,
  model,
  modelId,
  timeoutMs,
  region,
  keepModules,
  featherModules,
  blendStyle = SCENE_BLEND_STYLE,
}: {
  text: string;
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  seed: number;
  /** An uploaded PNG/JPEG data URL (never a remote URL) */
  reference?: string;
  /** The picture (PNG or JPEG bytes); never stored or logged */
  picture: Uint8Array;
  /** The code's control (renderControlImage), for its module map */
  control: ControlImage;
  signal: AbortSignal;
  model?: ArtImageModel;
  modelId?: string;
  timeoutMs?: number;
  /** The eval tries others */
  region?: PictureRegion;
  keepModules?: number;
  featherModules?: number;
  blendStyle?: BlendStyle;
}): Promise<AIArtVariant> {
  // Square at the delivered size (the client crops photos square).
  const { pixels } = await readModelImage({
    data: picture,
    mediaType: mediaTypeOf(picture),
  });
  const painted = await paintIntoPicture({
    text,
    prompt,
    negativePrompt,
    visibility,
    creativity,
    seed,
    picture: pixels,
    codeControl: control,
    ...(region && { region }),
    ...(keepModules !== undefined && { keepModules }),
    ...(featherModules !== undefined && { featherModules }),
    ...(reference && {
      reference: new Uint8Array(
        Buffer.from(reference.slice(reference.indexOf(",") + 1), "base64"),
      ),
    }),
    ...(model && { model }),
    ...(modelId && { modelId }),
    ...(timeoutMs !== undefined && { timeoutMs }),
    signal,
  });
  return deliverVariant({
    text,
    art: painted.art,
    control: painted.control,
    visibility,
    seed,
    signal,
    blendStyle,
  });
}
