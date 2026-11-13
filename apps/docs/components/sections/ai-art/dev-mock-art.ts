// Dev only: stand-in AI art, so the playground's Art tab and the /ai/art
// studio can be checked without signing in, spending credits or calling a
// model. use-ai-art-run.ts imports this lazily, and only inside a
// `process.env.NODE_ENV === "development"` branch with the localStorage flag
// set (see devArtMock there), so a production build never contains it.
//
// Each "image" is a real QR code for the request's text, drawn over a soft
// gradient: it scans, so the in-browser scan score, Print PNG and Use as
// Image QR all run on it for real. Scene mode draws the code smaller, on a
// light mat in the middle of the gradient; photo mode draws it over the
// uploaded photo, the way the real pipeline places it.

import { getQRAsSVGDataUri } from "qrdx";
import {
  type AIArtCreditsResponse,
  type AIArtRequest,
  type AIArtResult,
  ART_IMAGE_SIZE,
  type ArtDescribeRequest,
  type ArtDescribeResult,
  DEFAULT_ART_MODE,
} from "./config";

const MOCK_DELAY_MS = 1200;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Dev mock: couldn't draw the code"));
    img.src = src;
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/** A fake /api/ai/art response for `request`. */
export async function mockArtImage(
  request: AIArtRequest,
  signal: AbortSignal,
): Promise<AIArtResult> {
  await wait(MOCK_DELAY_MS, signal);
  const seed = request.seed ?? 0;
  const visibility = request.visibility ?? 50;
  const size = ART_IMAGE_SIZE;

  const mode = request.mode ?? DEFAULT_ART_MODE;
  // Scene and photo modes: the code at about two thirds of the image.
  const codeSize = mode === "code" ? size : Math.round(size * 0.7);
  const code = await loadImage(
    await getQRAsSVGDataUri({
      value: request.text,
      level: "H",
      margin: mode === "code" ? 4 : 2,
      size: codeSize,
      fgColor: "#111827",
      bgColor: "#ffffff",
    }),
  );
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Dev mock: no canvas");

  const hue = (seed * 47) % 360;
  if (mode === "photo" && request.photo) {
    ctx.drawImage(await loadImage(request.photo), 0, 0, size, size);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, `hsl(${hue} 70% 82%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 55% 58%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  // Higher QR visibility shows the code more strongly.
  ctx.globalAlpha =
    mode === "code"
      ? 0.55 + (0.4 * visibility) / 100
      : 0.7 + (0.3 * visibility) / 100;
  const offset = (size - codeSize) / 2;
  ctx.drawImage(code, offset, offset, codeSize, codeSize);
  ctx.globalAlpha = 1;

  const imageUrl = canvas.toDataURL("image/png");
  canvas.remove();
  return {
    variant: {
      imageUrl,
      width: size,
      height: size,
      seed,
      blended: false,
      blend: "none",
      blendStrength: 0,
    },
    mode,
    text: request.text,
    visibility,
    creativity: request.creativity ?? 45,
    credits: null,
  };
}

/** Fake credits: a Pro month with room to spare. */
export function mockArtCredits(): AIArtCreditsResponse {
  const now = new Date();
  return {
    configured: true,
    credits: {
      plan: "pro",
      limit: 30,
      used: 2,
      remaining: 28,
      pooled: false,
      resetsAt: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ).toISOString(),
    },
  };
}

/** Stand-in descriptions for "Write one for me", one per press in turn. */
const MOCK_DESCRIPTIONS = [
  "a lighthouse on a rocky coast at dusk, waves catching the last warm light",
  "a quiet koi pond in the rain, lily pads and ripples under a gray sky",
  "a mountain village in the snow at night, lit windows glowing gold",
];
let mockDescriptionTurn = 0;

/** A fake /api/ai/art/describe response: the hint kept, else a stand-in. */
export async function mockArtDescription(
  request: ArtDescribeRequest,
  signal?: AbortSignal,
): Promise<ArtDescribeResult> {
  await wait(MOCK_DELAY_MS / 2, signal ?? new AbortController().signal);
  const stand = MOCK_DESCRIPTIONS[mockDescriptionTurn++ % 3] ?? "";
  const hint = request.hint?.trim();
  return { prompt: hint ? `${hint}, ${stand}` : stand };
}
