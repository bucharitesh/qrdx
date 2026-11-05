// Image fills travel like logos: they stay with the design they were
// uploaded into and never go into a link, a published style, a snippet or
// the AI's context. And the picker's fix for a picture meets the scan
// score's own bar for pictures.
import { readFileSync } from "node:fs";
import {
  getImageTonesFromPixels,
  getScanContrast,
  type ImagePaint,
  SCAN_IMAGE_CONTRAST_MIN,
} from "qrdx";
import { describe, expect, it } from "vitest";
import {
  fitStyleForSave,
  MAX_SAVED_STYLE_LENGTH,
} from "@/components/code-builder/validation";
import {
  cliSnippet,
  imageSnippet,
  mcpSnippet,
  reactSnippet,
  restSnippet,
  shadcnSnippet,
} from "@/components/editor/action-bar/code-snippets";
import { editorContextSchema } from "@/lib/ai/agent/editor-context";
import {
  removedPartsNote,
  toPublishableStyle,
} from "@/lib/community/public-style";
import { makeScannable, paintSafety } from "@/lib/paint/contrast";
import { hasImageFills, withoutImageFills } from "@/lib/paint/image-fills";
import { decodeStyleParam, encodeStyleParam } from "@/lib/playground-style";
import type { ThemeStyles } from "@/types/theme";

const SRC = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ";

const picture = (extra: Partial<ImagePaint> = {}): ImagePaint => ({
  type: "image",
  src: SRC,
  fit: "cover",
  scale: 1,
  position: "center",
  opacity: 0.6,
  underlay: "#111827",
  ...extra,
});

const STYLE: ThemeStyles = {
  bgColor: "#ffffff",
  fgColor: picture(),
  eyeColor: "#000000",
  eyeColors: { topLeft: { inner: picture({ underlay: undefined }) } },
};

describe("withoutImageFills", () => {
  it("swaps each picture for its underlay, or leaves the part unset", () => {
    expect(hasImageFills(STYLE)).toBe(true);
    const next = withoutImageFills(STYLE);
    expect(next.fgColor).toBe("#111827");
    expect(next.eyeColors?.topLeft?.inner).toBeUndefined();
    expect(next.bgColor).toBe("#ffffff");
    expect(hasImageFills(next)).toBe(false);
    const plain = { fgColor: "#000000" };
    expect(withoutImageFills(plain)).toBe(plain);
  });
});

describe("style links", () => {
  it("never carry a picture and say so", () => {
    const encoded = encodeStyleParam(STYLE);
    expect(encoded?.omitted).toContain("image");
    expect(encoded?.value).not.toContain("base64");
    const decoded = decodeStyleParam(encoded?.value);
    expect(decoded?.styles.fgColor).toBe("#111827");
  });

  it("refuse a link that carries one", () => {
    const forged = `1.${Buffer.from(JSON.stringify({ fg: picture() })).toString(
      "base64url",
    )}`;
    const decoded = decodeStyleParam(forged);
    expect(decoded?.styles.fgColor).toBeUndefined();
  });
});

describe("community publish", () => {
  it("strips pictures like uploaded logos, with a note", () => {
    const { style, removed } = toPublishableStyle(STYLE);
    expect(removed).toContain("image");
    expect(JSON.stringify(style)).not.toContain(SRC);
    expect(style.fgColor).toBe("#111827");
    expect(removedPartsNote(removed)).toMatch(/image fills aren't shared/i);
    expect(removedPartsNote(["logo", "image"])).toMatch(
      /uploaded logo isn't shared.*Image fills aren't shared either/,
    );
  });
});

describe("Get code", () => {
  it("leaves pictures out of every snippet, with a note", () => {
    const input = {
      style: STYLE,
      value: "https://qrdx.dev",
      contentType: "url" as const,
    };
    for (const snippet of [
      reactSnippet(input),
      shadcnSnippet(input),
      imageSnippet(input),
      restSnippet(input),
      mcpSnippet(input),
      cliSnippet(input),
    ]) {
      const code = "code" in snippet ? snippet.code : "";
      expect(code).not.toContain("base64");
      expect(snippet.omitted.join("\n")).toMatch(/Image fills/);
    }
  });
});

describe("saving a code", () => {
  it("drops pictures for their underlay when the design is too large", () => {
    const big = picture({
      src: `data:image/jpeg;base64,${"A".repeat(MAX_SAVED_STYLE_LENGTH)}`,
    });
    const { style, trimmed } = fitStyleForSave({ fgColor: big });
    expect(trimmed).toBe(true);
    expect(style.fgColor).toBe("#111827");
    // Small enough: kept as is
    expect(fitStyleForSave(STYLE).style).toBe(STYLE);
  });
});

describe("AI context", () => {
  it("never sends a picture to the model", () => {
    const parsed = editorContextSchema.parse({
      contentType: "url",
      value: "https://qrdx.dev",
      style: STYLE,
      hasArt: false,
    });
    expect(JSON.stringify(parsed)).not.toContain(SRC);
    expect(parsed.style.fgColor).toBe("#111827");
  });
});

describe("the picker's fix for a picture", () => {
  const png = readFileSync(
    new URL(
      "../../../../packages/qrdx/tests/fixtures/art/latte.png",
      import.meta.url,
    ),
  );

  it("fades it over a dark underlay until it passes the scan score's bar", async () => {
    const { decodePNGPixels } = await import("qrdx");
    const decoded = await decodePNGPixels(new Uint8Array(png));
    if (!decoded) throw new Error("fixture");
    const src = `data:image/png;base64,${png.toString("base64")}`;
    const tones = { [src]: getImageTonesFromPixels(decoded) as never };
    const bare: ImagePaint = picture({ src, opacity: 1, underlay: undefined });
    const style = { bgColor: "#ffffff" };

    const before = paintSafety("code", bare, style, tones);
    expect(before.required).toBe(SCAN_IMAGE_CONTRAST_MIN.code);
    expect(before.level).not.toBe("good");

    const fixed = makeScannable("code", bare, style, tones) as ImagePaint;
    expect(fixed.type).toBe("image");
    expect(fixed.underlay).toBe("#000000");
    expect(fixed.opacity).toBeLessThan(1);
    const after = getScanContrast(
      { value: "x", bgColor: "#ffffff", fgColor: fixed },
      { imageTones: tones },
    );
    expect(after.ratio).toBeGreaterThanOrEqual(after.required);
    expect(paintSafety("code", fixed, style, tones).level).toBe("good");
  });

  it("waits for the picture's tones before offering a fix", () => {
    expect(makeScannable("code", picture(), { bgColor: "#ffffff" })).toBeNull();
  });
});
