// Templates in the editor are frames: tiles in the frame picker's Classic
// group, one choice with the other frames and the shaped codes
// (components/editor/control-sections/frame-templates.ts).
import { BUILT_IN_FRAMES, getTemplateIds } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  CLASSIC_FRAME_IDS,
  classicFrameOf,
  FRAME_TEMPLATES,
  TEMPLATE_PREFIX,
  templateOf,
  templateTakesCodeColor,
  withClassicFrame,
  withoutTemplate,
} from "@/components/editor/control-sections/frame-templates";

describe("templates as frames", () => {
  it("lists every template with artwork, after the built-in frames", () => {
    expect(FRAME_TEMPLATES.map((template) => template.id)).toEqual(
      getTemplateIds().filter((id) => id !== "default"),
    );
    expect(CLASSIC_FRAME_IDS).toEqual([
      "none",
      ...BUILT_IN_FRAMES.map((frame) => frame.style),
      ...FRAME_TEMPLATES.map((template) => `${TEMPLATE_PREFIX}${template.id}`),
    ]);
  });

  it("reads a design's template, if it draws one", () => {
    expect(templateOf({ templateId: "Arrow" })?.name).toBe("Arrow");
    expect(templateOf({ templateId: "default" })).toBeUndefined();
    expect(templateOf({})).toBeUndefined();
    expect(withoutTemplate({ templateId: "Arrow", fgColor: "#111" })).toEqual({
      fgColor: "#111",
    });
  });

  it("knows which templates take the dots' color", () => {
    const dotColored = FRAME_TEMPLATES.filter(templateTakesCodeColor).map(
      (template) => template.id,
    );
    expect(dotColored).toEqual([
      "Arrow",
      "StandardBox",
      "SquareBorder",
      "DotRing",
    ]);
  });

  it("shows the Classic tile a design has", () => {
    expect(classicFrameOf({})).toBe("none");
    expect(classicFrameOf({ templateId: "Halloween" })).toBe(
      `${TEMPLATE_PREFIX}Halloween`,
    );
    expect(classicFrameOf({ frame: { style: "ticket" } })).toBe("ticket");
    // A legacy design with both shows its frame
    expect(
      classicFrameOf({ frame: { style: "ticket" }, templateId: "Arrow" }),
    ).toBe("ticket");
    expect(classicFrameOf({ shape: "heart" })).toBeNull();
  });

  it("replaces the frame, template or shaped code with one Classic tile", () => {
    const framed = {
      frame: { style: "banner-bottom" as const, text: "Menu", color: "#111" },
      templateId: "Arrow",
      shape: "circle" as const,
    };
    expect(withClassicFrame(framed, `${TEMPLATE_PREFIX}StandardBox`)).toEqual({
      templateId: "StandardBox",
    });
    // A built-in frame keeps the text and colors chosen so far
    expect(withClassicFrame(framed, "ticket")).toEqual({
      frame: { style: "ticket", text: "Menu", color: "#111" },
    });
    expect(withClassicFrame(framed, "none")).toEqual({
      frame: { style: "none" },
    });
  });
});
