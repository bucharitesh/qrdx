// Frames and templates: a frame adds room around the code and must never
// cover modules or the quiet zone; labels are capped at 24 characters.
import { describe, expect, it } from "vitest";
import {
  getFrameDimensions,
  getFrameLayout,
  getFrameText,
  isFrameActive,
} from "../src/frame";
import { getAllTemplates, getTemplate, getTemplateIds } from "../src/templates";
import {
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  frameSchema,
} from "../types/frame";
import { renderSvg } from "./support/qr";

const active = FRAME_STYLES.filter((style) => style !== "none");

describe("frames", () => {
  it("treats none, null and undefined as no frame", () => {
    expect(isFrameActive({ style: "none" })).toBe(false);
    expect(isFrameActive(null)).toBe(false);
    expect(isFrameActive(undefined)).toBe(false);
    expect(getFrameDimensions(200, { style: "none" })).toEqual({
      width: 200,
      height: 200,
    });
  });

  it.each(
    active
  )("%s keeps the code at full size inside the artwork", (style) => {
    const layout = getFrameLayout(200, { style });
    expect(layout.qrSize).toBe(200);
    expect(layout.qrX).toBeGreaterThanOrEqual(0);
    expect(layout.qrY).toBeGreaterThanOrEqual(0);
    expect(layout.qrX + layout.qrSize).toBeLessThanOrEqual(layout.width);
    expect(layout.qrY + layout.qrSize).toBeLessThanOrEqual(layout.height);
    expect(getFrameDimensions(200, { style })).toEqual({
      width: layout.width,
      height: layout.height,
    });
  });

  it.each(
    active
  )("%s draws its shapes behind the code, never on top", (style) => {
    const svg = renderSvg({ value: "frame", size: 200, frame: { style } });
    // The QR code is the last nested <svg>; frame shapes come before it.
    const codeStart = svg.indexOf("<svg", 1);
    expect(codeStart).toBeGreaterThan(0);
    const after = svg.slice(svg.indexOf("</svg>", codeStart) + 6);
    expect(after).not.toMatch(/<(rect|path|polygon)\b/);
  });

  it("uses 'Scan me' by default, trims, caps at 24 characters and allows hiding", () => {
    expect(getFrameText({ style: "banner-bottom" })).toBe("Scan me");
    expect(getFrameText({ style: "banner-bottom", text: "  Menu  " })).toBe(
      "Menu"
    );
    expect(
      getFrameText({ style: "banner-bottom", text: "x".repeat(40) })
    ).toHaveLength(FRAME_TEXT_MAX_LENGTH);
    expect(getFrameText({ style: "banner-bottom", text: "" })).toBe("");
    expect(
      getFrameLayout(200, { style: "banner-bottom", text: "" }).label
    ).toBeNull();
  });

  it("fits long labels inside the frame width", () => {
    const layout = getFrameLayout(200, {
      style: "banner-bottom",
      text: "W".repeat(24),
    });
    expect(layout.label?.maxWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.label?.fontSize).toBeGreaterThan(0);
  });

  it("validates frames with the schema", () => {
    expect(
      frameSchema.safeParse({ style: "banner-top", text: "Scan" }).success
    ).toBe(true);
    expect(frameSchema.safeParse({ style: "banner" }).success).toBe(false);
    expect(
      frameSchema.safeParse({ style: "border", text: "x".repeat(25) }).success
    ).toBe(false);
  });
});

describe("templates", () => {
  it("registers every template under its own id", () => {
    for (const id of getTemplateIds().filter((name) => name !== "default")) {
      expect(getTemplate(id)?.id).toBe(id);
      expect(typeof getTemplate(id)?.wrapper).toBe("function");
    }
    expect(getAllTemplates()).toHaveLength(getTemplateIds().length);
    expect(getTemplate("does-not-exist")).toBeUndefined();
  });
});
