import "server-only";

// Prototype, measured by scripts/ai/art-eval-picture.ts and not used by the
// app yet: "picture first" scene and photo art. The picture comes first (the
// user's photo, or one text-to-image call from the description), then the
// code is painted into a square of it:
// - "paint": the code-mode treatment on that square alone. The model gets
//   the control code and the square of the picture, and repaints the
//   picture as the code, so the modules are made of the picture's own
//   content. The result goes back into the picture at exactly that square,
//   feathered at the seam; everything around it stays the picture's pixels.
// - "extend": the other way round. Code mode paints the code from the
//   description, the code's square is shrunk into the middle of a canvas,
//   the model extends the picture outward, and the code's own pixels go
//   back in the middle so it scans as painted.
// Either way the result then takes the usual scan check and least blend.

import { generateImage, generateText, NoImageGeneratedError } from "ai";
import { type DecodedImage, QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { ART_IMAGE_SIZE } from "@/components/sections/ai-art/config";
import { serializeQrSvg } from "@/lib/qr-render";
import { encodePng, type ModuleGrid } from "./art-blend";
import {
  type ArtImageModel,
  type ArtModelImage,
  buildArtPrompt,
  type ControlImage,
  callModel,
  controlProps,
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

/** The art model as a text-to-image model; `quality` for GPT Image 2. */
export function pictureModelFor(
  choice: ArtModelChoice = AI_MODELS.art,
  { quality }: { quality?: "low" | "medium" | "high" } = {},
): PictureModel {
  const options = artProviderOptions(choice);
  if (quality) {
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
    "- Don't zoom, crop or re-center: the code covers exactly the same pixels as in the first image.",
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
  void model;
  return lines.join("\n");
}

export interface PictureArt {
  /** The picture with the code in it, before the scan check */
  art: { png: Uint8Array; pixels: DecodedImage };
  /** Where the code is in `art`, for the scan check and blend */
  control: ControlImage;
  /** The model's answers, in order */
  raw: ArtModelImage[];
  /** Per call, in ms */
  latencies: number[];
}

const timed = async <T>(
  run: () => Promise<T>,
  latencies: number[],
): Promise<T> => {
  const started = performance.now();
  const result = await run();
  latencies.push(Math.round(performance.now() - started));
  return result;
};

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
  model,
  modelId = AI_MODELS.art.model,
  signal,
  timeoutMs = 45_000,
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
  model: ArtImageModel;
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
  const latencies: number[] = [];
  const raw = await timed(
    () =>
      callModel(
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
      ),
    latencies,
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
    raw: [raw],
    latencies,
  };
}

/** "extend": the instruction for painting the picture out from the middle. */
export function buildExtendPrompt(prompt: string): string {
  return [
    `The first image is a square picture in the middle of a flat grey canvas. Extend the picture outward so it fills the whole canvas seamlessly, edge to edge, continuing its scene: ${sentence(prompt)}.`,
    "Don't change anything inside the middle square: keep it exactly as it is, at the same pixels and size.",
    "Continue its colors, light and perspective out to the edges, so the middle square reads as part of one picture, not a panel or a frame.",
    "No text, letters, logos, signatures or watermarks.",
  ].join("\n");
}

/**
 * "extend": code mode from the description, then the picture extended out
 * from the code's square, with the code's own pixels put back.
 */
export async function extendFromCode({
  text,
  prompt,
  negativePrompt,
  visibility,
  creativity,
  seed,
  codeControl,
  region = PICTURE_REGION,
  margin = 1,
  featherModules = 0.6,
  model,
  modelId = AI_MODELS.art.model,
  signal,
  timeoutMs = 45_000,
}: {
  text: string;
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  seed: number;
  codeControl: ControlImage;
  region?: PictureRegion;
  margin?: number;
  featherModules?: number;
  model: ArtImageModel;
  modelId?: string;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<PictureArt> {
  void text;
  const latencies: number[] = [];
  const code = await timed(
    () =>
      callModel(
        model,
        {
          prompt: buildArtPrompt({
            prompt,
            negativePrompt,
            visibility,
            creativity,
            withReference: false,
            model: modelId,
          }),
          images: [codeControl.png],
          seed,
        },
        signal,
        timeoutMs,
      ),
    latencies,
  );
  const codePixels = (await readModelImage(code)).pixels;
  // The code's square with `margin` modules of its border.
  const { left, top, pitch } = codeControl.grid;
  const from = Math.round(left - margin * pitch);
  const fromTop = Math.round(top - margin * pitch);
  const side = Math.round((codeControl.modules + 2 * margin) * pitch);
  const { square, grid } = paintGeometry(codeControl.modules, region, margin);
  const middle = await resize(
    crop(codePixels, from, fromTop, side),
    square.side,
  );
  // The canvas the model extends: flat grey, the code's square in the middle.
  const canvas = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = 128;
    canvas[i + 1] = 128;
    canvas[i + 2] = 128;
    canvas[i + 3] = 255;
  }
  const seeded = pasteFeathered(
    { width: SIZE, height: SIZE, data: canvas },
    middle,
    square,
    0,
  );
  const extended = await timed(
    () =>
      callModel(
        model,
        {
          prompt: buildExtendPrompt(prompt),
          images: [encodePng(seeded)],
          seed,
        },
        signal,
        timeoutMs,
      ),
    latencies,
  );
  const outside = (await readModelImage(extended)).pixels;
  const pixels = pasteFeathered(
    outside,
    middle,
    square,
    featherModules * grid.pitch,
  );
  return {
    art: { png: encodePng(pixels), pixels },
    control: {
      png: codeControl.png,
      modules: codeControl.modules,
      map: codeControl.map,
      grid,
      mode: "scene",
    },
    raw: [code, extended],
    latencies,
  };
}
