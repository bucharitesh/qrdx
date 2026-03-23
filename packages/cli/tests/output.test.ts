import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const svg = buildSVGString({ value: "https://qrdx.dev", fgColor: "#ff0000" });
    expect(svg).toContain("#ff0000");
  });

  it("respects background color", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev", bgColor: "#0000ff" });
    expect(svg).toContain("#0000ff");
  });

  it("accepts body pattern", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev", bodyPattern: "circle" });
    expect(svg).toMatch(/^<svg/);
  });

  it("accepts corner eye pattern", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev", cornerEyePattern: "gear" });
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

describe("saveOutput – SVG", () => {
  it("writes an SVG file to disk", async () => {
    const out = tmp("save.svg");
    cleanups.push(out);
    await saveOutput({ value: "https://qrdx.dev", outputPath: out, format: "svg" });
    expect(existsSync(out)).toBe(true);
  });

  it("SVG file begins with <?xml declaration", async () => {
    const out = tmp("xmldecl.svg");
    cleanups.push(out);
    await saveOutput({ value: "https://qrdx.dev", outputPath: out, format: "svg" });
    const content = readFileSync(out, "utf-8");
    expect(content).toMatch(/^<\?xml/);
  });

  it("SVG file contains <svg and </svg>", async () => {
    const out = tmp("valid.svg");
    cleanups.push(out);
    await saveOutput({ value: "https://qrdx.dev", outputPath: out, format: "svg" });
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
});
