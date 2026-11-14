// The pictures attached in the Generate tab, read in the browser for
// use_image: scaled into a logo or an image fill the editor can save, or
// sampled for Logo QR / Image QR art, and scored with the editor's own scan
// score. Nothing here leaves the browser.
import { getImageTones, getScanScore, loadQRArtImage } from "qrdx";
import type { ImagePlacement } from "@/lib/ai/agent/image-uses";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { IMAGE_FILL_MAX_LENGTH } from "@/lib/paint/saved-paint";
import { designQRProps } from "@/lib/qr-design/props";
import type { ScoreFn } from "@/lib/qr-design/repair";
import type { ChatMessage } from "@/types/ai";
import type { PlacementAssets } from "./image-placement";

/**
 * Largest logo a chat request carries along (lib/ai/agent/editor-context.ts
 * MAX_CONTEXT_LOGO_LENGTH; not imported, to keep its zod schemas out).
 */
const MAX_CONTEXT_LOGO_LENGTH = 200_000;

/** Every picture attached in the chat, in order (Image 1 first). */
export function chatImages(messages: ChatMessage[]): string[] {
  return messages.flatMap((message) =>
    message.role === "user"
      ? (message.metadata?.promptData?.images ?? []).map((image) => image.url)
      : [],
  );
}

/** Image `number` of the chat (1-based), or the latest one. */
export function pickAttachment(
  messages: ChatMessage[],
  number?: number,
): string | null {
  const images = chatImages(messages);
  if (number === undefined) return images.at(-1) ?? null;
  return images[number - 1] ?? null;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

/** `img` at `side` px at most: PNG when it has transparency, else JPEG. */
function encode(img: HTMLImageElement, side: number): string {
  // An SVG without a size reports 0; draw it at the side asked for.
  const width = img.naturalWidth || side;
  const height = img.naturalHeight || side;
  const scale = Math.min(1, side / Math.max(width, height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't read the picture.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] as number) < 250) {
      transparent = true;
      break;
    }
  }
  const url = transparent
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.86);
  canvas.remove();
  return url;
}

/** The picture re-encoded at the largest of `sides` that fits `maxLength`. */
async function encodeToFit(
  src: string,
  sides: number[],
  maxLength: number,
): Promise<string> {
  const img = await loadImage(src);
  for (const side of sides) {
    const encoded = encode(img, side);
    if (encoded.length <= maxLength) return encoded;
  }
  throw new Error("This picture is too detailed to keep. Try a smaller one.");
}

/**
 * What `placement` needs from the picture: a logo (kept small enough to go
 * along with chat requests, so a template can save it), an art sample grid,
 * or an image fill's picture with its tones.
 */
export async function prepareAssets(
  src: string,
  placement: ImagePlacement,
): Promise<PlacementAssets> {
  switch (placement) {
    case "logo":
      return {
        logo: await encodeToFit(
          src,
          [512, 384, 256, 192],
          MAX_CONTEXT_LOGO_LENGTH,
        ),
      };
    case "logo_qr":
      return { art: { logo: await loadQRArtImage(src, { mode: "logo" }) } };
    case "image_qr":
      return {
        art: { halftone: await loadQRArtImage(src, { mode: "halftone" }) },
      };
    case "background":
    case "dots": {
      const picture = await encodeToFit(
        src,
        [1024, 768, 512, 384],
        IMAGE_FILL_MAX_LENGTH,
      );
      const tones = await getImageTones(picture).catch(() => null);
      return { picture, tones: tones ? { [picture]: tones } : {} };
    }
  }
}

/** The editor's scan score (the preview badge's) for `value` in `style`. */
export const browserScore: ScoreFn = (value, style) =>
  getScanScore(
    designQRProps(value, style, style.customLogo ?? DEFAULT_QR_LOGO),
  );
