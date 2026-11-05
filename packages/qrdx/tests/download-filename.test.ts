/** biome-ignore-all lint/style/noMagicNumbers: sizes under test */
// A download's file name states the pixel size of the file that is saved.
// A frame makes the image bigger than the code (a 400 px code with a bottom
// banner is a 496 × 568 PNG), so the name follows the canvas the file is
// drawn on, not the code size. Vector files (SVG, EPS) have no pixel size
// and say none.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadQRCode, getDownloadFilename } from "../src/download";
import { getFrameDimensions } from "../src/frame";
import type { QRFrame, QRProps } from "../types";

interface Saved {
  name: string;
  href: string;
}

let saved: Saved[] = [];
let canvases: { width: number; height: number }[] = [];

beforeEach(() => {
  saved = [];
  canvases = [];
  const createElement = (tag: string) => {
    if (tag === "canvas") {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          fillRect: () => undefined,
          drawImage: () => undefined,
        }),
        toDataURL: (type: string) => `data:${type};base64,AA`,
        remove: () => undefined,
      };
      canvases.push(canvas);
      return canvas;
    }
    if (tag === "a") {
      const link = {
        href: "",
        download: "",
        click: () => saved.push({ name: link.download, href: link.href }),
      };
      return link;
    }
    throw new Error(`unexpected <${tag}>`);
  };
  vi.stubGlobal("document", {
    createElement,
    body: { appendChild: () => undefined, removeChild: () => undefined },
  });
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const props = (frame?: QRFrame): QRProps => ({
  value: "https://qrdx.dev",
  ...(frame && { frame }),
});

const FRAMES: (QRFrame | undefined)[] = [
  undefined,
  { style: "banner-bottom", text: "Scan me" },
  { style: "rounded-border", text: "Scan me" },
  { style: "circle", text: "Scan me" },
  { style: "polaroid", text: "Scan me" },
];

describe("downloaded file names", () => {
  const CASES = FRAMES.flatMap((frame) =>
    (["png", "jpg"] as const).map((format) => ({
      frame,
      format,
      name: `${format}, ${frame?.style ?? "no frame"}`,
    }))
  );

  it.each(CASES)("$name: names the canvas size", async ({ frame, format }) => {
    await downloadQRCode(props(frame), {
      format,
      size: { width: 400, height: 400 },
    });
    const canvas = canvases.at(-1);
    expect(canvas).toBeDefined();
    expect(saved).toEqual([
      expect.objectContaining({
        name: `qr-code-${canvas?.width}x${canvas?.height}.${format}`,
      }),
    ]);
  });

  it("names a framed 400 px PNG after its 496 × 568 canvas", async () => {
    await downloadQRCode(props({ style: "banner-bottom", text: "Scan me" }), {
      format: "png",
      size: { width: 400, height: 400 },
    });
    expect(saved[0]?.name).toBe("qr-code-496x568.png");
  });

  it("gives vector files no pixel size", async () => {
    await downloadQRCode(props(FRAMES[1]), {
      format: "svg",
      size: { width: 400, height: 400 },
    });
    expect(saved[0]?.name).toBe("qr-code.svg");
    expect(
      getDownloadFilename("eps", { width: 400, height: 400 }, FRAMES[1])
    ).toBe("qr-code.eps");
  });

  it("names a PDF after the image it holds, frame included", () => {
    const frame = FRAMES[2];
    const { width, height } = getFrameDimensions(800, frame);
    expect(getDownloadFilename("pdf", { width: 800, height: 800 }, frame)).toBe(
      `qr-code-${Math.round(width)}x${Math.round(height)}.pdf`
    );
  });

  it("keeps a file name the caller chose", async () => {
    await downloadQRCode(props(FRAMES[1]), {
      format: "png",
      size: { width: 400, height: 400 },
      filename: "menu.png",
    });
    expect(saved[0]?.name).toBe("menu.png");
  });
});
