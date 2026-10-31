import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { buildSVGString, saveOutput } from "../src/render/output.js";

const tmp = (name: string) => join(tmpdir(), `qrdx-output-test-${name}`);

const cleanups: string[] = [];
afterEach(() => {
  for (const f of cleanups.splice(0)) {
    if (existsSync(f)) {
      rmSync(f);
    }
  }
});

describe("buildSVGString", () => {
  it("returns a string starting with <svg", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev" });
    expect(svg).toMatch(/^<svg/);
  });

  it("includes width and height attributes", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev", size: 256 });
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
  });

  it("uses default size of 512 when not specified", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev" });
    expect(svg).toContain('width="512"');
  });

  it("encodes the given value as a scannable QR", () => {
    const svg = buildSVGString({ value: "hello-world" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toMatch(/<(path|rect)/);
  });

  it("respects foreground color", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      fgColor: "#ff0000",
    });
    expect(svg).toContain("#ff0000");
  });

  it("respects background color", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      bgColor: "#0000ff",
    });
    expect(svg).toContain("#0000ff");
  });

  it("accepts body pattern", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      bodyPattern: "circle",
    });
    expect(svg).toMatch(/^<svg/);
  });

  it("accepts corner eye pattern", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      cornerEyePattern: "gear",
    });
    expect(svg).toMatch(/^<svg/);
  });

  it("accepts corner dot pattern", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      cornerEyeDotPattern: "star",
    });
    expect(svg).toMatch(/^<svg/);
  });
});

describe("buildSVGString – frames", () => {
  it("keeps the QR code at full size inside the frame", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      size: 300,
      frame: { style: "border", text: "Hi" },
    });
    expect(svg).toMatch(/^<svg[^>]*width="372"/);
    // The code itself is nested at its original size.
    expect(svg).toMatch(/<svg[^>]*height="300"[^>]*width="300"[^>]*x="36"/);
  });

  it("caps the label at 24 characters", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      frame: { style: "banner-top", text: "A".repeat(30) },
    });
    expect(svg).toContain(`>${"A".repeat(24)}</text>`);
  });

  it("puts caller SVG attributes on the outer frame element", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      frame: { style: "banner-bottom" },
      // @ts-expect-error SVG attribute passthrough
      "aria-label": "Menu QR code",
    });
    expect(svg).toMatch(/^<svg[^>]*aria-label="Menu QR code"/);
    expect(svg.match(/aria-label/g)).toHaveLength(1);
  });
});

describe("saveOutput – SVG", () => {
  it("writes an SVG file to disk", async () => {
    const out = tmp("save.svg");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "svg",
    });
    expect(existsSync(out)).toBe(true);
  });

  it("SVG file begins with <?xml declaration", async () => {
    const out = tmp("xmldecl.svg");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "svg",
    });
    const content = readFileSync(out, "utf-8");
    expect(content).toMatch(/^<\?xml/);
  });

  it("SVG file contains <svg and </svg>", async () => {
    const out = tmp("valid.svg");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "svg",
    });
    const content = readFileSync(out, "utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain("</svg>");
  });
});

describe("saveOutput – PNG", () => {
  it("writes a PNG file to disk", async () => {
    const out = tmp("save.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 128,
    });
    expect(existsSync(out)).toBe(true);
  });

  it("PNG file has correct magic bytes", async () => {
    const out = tmp("magic.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 64,
    });
    const buf = readFileSync(out);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  // sharp's SVG renderer ignores embedded <image> elements, so the logo has to
  // be composited onto the PNG.
  const redLogo = async () => {
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  };
  const countRedPixels = async (file: string) => {
    const { data, info } = await sharp(file)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < info.width * info.height * 3; i += 3) {
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
        red++;
      }
    }
    const mid =
      (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) *
      3;
    return { red, center: [data[mid], data[mid + 1], data[mid + 2]] };
  };

  it("draws the center logo into the PNG", async () => {
    const out = tmp("logo.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 256,
      level: "H",
      imageSettings: {
        src: await redLogo(),
        width: 52,
        height: 52,
        excavate: true,
      },
    });
    const { red, center } = await countRedPixels(out);
    expect(center).toEqual([255, 0, 0]);
    expect(red).toBeGreaterThan(40 * 40);
  });

  it("draws the logo inside a template", async () => {
    const out = tmp("logo-template.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 300,
      templateId: "SquareBorder",
      imageSettings: {
        src: await redLogo(),
        width: 60,
        height: 60,
        excavate: true,
      },
    });
    const { red } = await countRedPixels(out);
    expect(red).toBeGreaterThan(40 * 40);
  });
});
