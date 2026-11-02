// The design core shared by the AI chat and the MCP design_qr tool
// (lib/qr-design): content validated like the editor's forms, the style
// vocabulary, and the score-and-repair loop. Scores come from the real
// engine (rendered and decoded on the server); a fake score function checks
// the loop's bounds. No model, database or network.
import type { ScanScoreResult } from "qrdx";
import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_FIELDS,
  CONTENT_TYPE_IDS,
  contentFieldGuide,
  contentInputSchema,
  describeContent,
  validateDesignContent,
} from "@/lib/qr-design/content";
import {
  GREAT_SCORE,
  MAX_REPAIRS,
  normalizeDesign,
  repairDesign,
  runDesignLoop,
} from "@/lib/qr-design/repair";
import { scoreDesign } from "@/lib/qr-design/score";
import {
  CLASSIC_STYLE,
  type DesignStyle,
  designStyleSchema,
  fromThemeStyles,
  styleDiff,
  toThemeStyles,
} from "@/lib/qr-design/style";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";

describe("content", () => {
  it("covers every content type the editor offers", () => {
    expect([...CONTENT_TYPE_IDS].sort()).toEqual(
      CONTENT_TYPES_METADATA.map((item) => item.type).sort(),
    );
    expect(CONTENT_FIELDS.wifi.map((field) => field.name)).toEqual([
      "ssid",
      "password",
      "encryption",
      "hidden",
    ]);
    expect(contentFieldGuide()).toContain(
      "wifi (WiFi): ssid*, password*, encryption*=WPA|WEP|nopass, hidden (true/false)",
    );
  });

  it("encodes Wi-Fi exactly as the editor does", () => {
    const result = validateDesignContent({
      type: "wifi",
      ssid: "Cafe Guest",
      password: "sunshine123",
      encryption: "WPA",
    });
    expect(result).toEqual({
      ok: true,
      content: {
        type: "wifi",
        ssid: "Cafe Guest",
        password: "sunshine123",
        encryption: "WPA",
      },
      // The editor's form encodes `hidden` as H:false too.
      value: "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;H:false;;",
    });
  });

  it("refuses what the editor's form refuses, with the reason", () => {
    const short = validateDesignContent({
      type: "wifi",
      ssid: "Cafe",
      password: "short",
      encryption: "WPA",
    });
    expect(short.ok).toBe(false);
    expect(!short.ok && short.issues[0]?.message).toMatch(/8-63/);

    const email = validateDesignContent({ type: "email", recipient: "nope" });
    expect(!email.ok && email.issues[0]?.field).toBe("recipient");

    const reddit = validateDesignContent({ type: "reddit" });
    expect(!reddit.ok && reddit.issues[0]?.message).toMatch(
      /username|subreddit/i,
    );
  });

  it("ignores fields that don't belong to the type", () => {
    const result = validateDesignContent({
      type: "url",
      url: "qrdx.dev",
      ssid: "stray",
    });
    expect(result.ok && result.content).toEqual({
      type: "url",
      url: "qrdx.dev",
    });
    expect(result.ok && result.value).toBe("https://qrdx.dev");
  });

  it("builds vCards and describes content without secrets", () => {
    const result = validateDesignContent({
      type: "vcard",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    });
    expect(result.ok && result.value).toMatch(/^BEGIN:VCARD/);
    expect(result.ok && describeContent(result.content)).toBe(
      "Contact · Ada Lovelace",
    );
    const wifi = validateDesignContent({
      type: "wifi",
      ssid: "Home",
      password: "correct-horse",
      encryption: "WPA",
    });
    expect(wifi.ok && describeContent(wifi.content)).toBe("WiFi · Home");
  });

  it("takes flat input any provider's tool schema accepts", () => {
    const parsed = contentInputSchema.safeParse({
      type: "upi",
      upiId: "cafe@bank",
      amount: "120",
    });
    expect(parsed.success).toBe(true);
    expect(contentInputSchema.safeParse({ type: "fax" }).success).toBe(false);
  });
});

describe("style", () => {
  it("converts to editor styles with frames, borders and gradients", () => {
    const styles = toThemeStyles({
      ...CLASSIC_STYLE,
      gradients: {
        body: { type: "linear", from: "#1E3A8A", to: "#7C3AED", angle: 45 },
      },
      frame: { style: "banner-bottom", text: "Join our Wi-Fi" },
      templateId: "StandardBox",
      logo: "wifi",
    });
    expect(styles.fgColor).toEqual({
      type: "linear",
      angle: 45,
      stops: [
        { color: "#1E3A8A", offset: 0 },
        { color: "#7C3AED", offset: 100 },
      ],
    });
    expect(styles.frame).toEqual({
      style: "banner-bottom",
      text: "Join our Wi-Fi",
    });
    expect(styles.templateId).toBe("StandardBox");
    expect(styles.showLogo).toBe(true);
  });

  it("reads editor styles back, replacing what it can't express", () => {
    const design = fromThemeStyles({
      bgColor: "#ffffff",
      fgColor: "rgba(0,0,0,0.5)",
      bodyPattern: "circle",
      cornerEyePattern: "curly",
      cornerEyeDotPattern: "circle",
      frame: { style: "border", text: "Hi" },
      showLogo: true,
    });
    expect(designStyleSchema.safeParse(design).success).toBe(true);
    expect(design.fgColor).toBe("#000000");
    expect(design.cornerEyePattern).toBe("rounded");
    expect(design.logo).toBe("keep");
    expect(design.frame).toEqual({ style: "border", text: "Hi" });
  });

  it("lists what changed in plain words", () => {
    expect(
      styleDiff(CLASSIC_STYLE, { ...CLASSIC_STYLE, fgColor: "#1E3A8A" }),
    ).toEqual([
      { key: "fgColor", label: "dots", from: "#000000", to: "#1E3A8A" },
    ]);
  });

  it("never keeps a shape pair the editor blocks", () => {
    const { style, changes } = normalizeDesign(
      {
        ...CLASSIC_STYLE,
        cornerEyePattern: "square",
        bodyPattern: "diamond",
      },
      { hasLogo: false },
    );
    expect(style.cornerEyePattern).not.toBe("square");
    expect(changes[0]).toMatch(/diamond dots next to square eyes/);
  });

  it("drops 'keep' when there is no logo to keep", () => {
    const { style } = normalizeDesign(
      { ...CLASSIC_STYLE, logo: "keep" },
      { hasLogo: false },
    );
    expect(style.logo).toBe("none");
  });
});

/** A pale, risky design: low-contrast dots, circle eyes and a logo at L. */
const RISKY: DesignStyle = {
  ...CLASSIC_STYLE,
  bgColor: "#FFF7ED",
  fgColor: "#FDBA74",
  eyeColor: "#FB923C",
  dotColor: "#FB923C",
  bodyPattern: "circle",
  cornerEyePattern: "circle",
  cornerEyeDotPattern: "circle",
  level: "L",
  logo: "qrdx",
};
const WIFI = "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;;";

describe("repairDesign", () => {
  it("fixes each failed check and says how", () => {
    const { style, changes } = repairDesign(RISKY, [
      { id: "contrast", message: "Low contrast" },
      { id: "eye-shape", message: "Circle eyes" },
      { id: "logo", message: "Logo covers" },
    ]);
    expect(style.cornerEyePattern).toBe("rounded");
    expect(style.level).toBe("H");
    expect(style.fgColor).not.toBe(RISKY.fgColor);
    expect(changes.join("\n")).toMatch(/Darkened the dots \(#FDBA74 → #/);
    expect(changes.join("\n")).toMatch(/error correction from L to H/);
  });
});

describe("runDesignLoop", () => {
  it("repairs a risky design to Great with the real scan score", async () => {
    const result = await runDesignLoop({
      value: WIFI,
      initial: RISKY,
      hasLogo: false,
      score: scoreDesign,
    });
    expect(result.attempts[0]?.grade).not.toBe("great");
    expect(result.grade).toBe("great");
    expect(result.score).toBeGreaterThanOrEqual(GREAT_SCORE);
    expect(result.repairs).toBeGreaterThan(0);
    expect(result.repairs).toBeLessThanOrEqual(MAX_REPAIRS + 1);
    expect(result.changes.length).toBeGreaterThan(0);
    // It kept the orange look rather than falling back to black on white.
    expect(result.style.bgColor).toBe("#FFF7ED");
  });

  it("asks the model first and keeps a revision that scores Great", async () => {
    const revise = vi.fn(
      async (
        style: DesignStyle,
        _failed: { id: string }[],
        _score: number,
      ) => ({
        ...style,
        fgColor: "#9A3412",
        eyeColor: "#7C2D12",
        dotColor: "#7C2D12",
        cornerEyePattern: "rounded" as const,
        logo: "none" as const,
      }),
    );
    const result = await runDesignLoop({
      value: WIFI,
      initial: RISKY,
      hasLogo: false,
      score: scoreDesign,
      revise,
    });
    expect(revise).toHaveBeenCalledTimes(1);
    expect(revise.mock.calls[0]?.[1]?.map((check) => check.id)).toEqual(
      expect.arrayContaining(["contrast", "eye-shape"]),
    );
    expect(result.attempts.map((attempt) => attempt.by)).toEqual([
      "initial",
      "model",
    ]);
    expect(result.grade).toBe("great");
    expect(result.changes).toContain("Dots: #FDBA74 → #9A3412");
  });

  it("stops after the repair limit and falls back to a classic code", async () => {
    // A scorer that only passes black-on-white square codes.
    const score = vi.fn(
      async (_value: string, style: ReturnType<typeof toThemeStyles>) =>
        ({
          score:
            style.bodyPattern === "square" && style.fgColor === "#000000"
              ? 100
              : 60,
          grade:
            style.bodyPattern === "square" && style.fgColor === "#000000"
              ? "great"
              : "risky",
          checks: [{ id: "decode-96", passed: false, message: "Doesn't read" }],
        }) satisfies ScanScoreResult,
    );
    const revise = vi.fn(async (style: DesignStyle) => ({
      ...style,
      bodyPattern: "heart" as const,
      fgColor: "#123456",
    }));
    const result = await runDesignLoop({
      value: WIFI,
      initial: { ...RISKY, frame: { style: "banner-bottom", text: "Wi-Fi" } },
      hasLogo: false,
      score,
      revise,
    });
    // Two model revisions, one deterministic repair, then the fallback.
    expect(revise).toHaveBeenCalledTimes(MAX_REPAIRS - 1);
    expect(result.attempts.map((attempt) => attempt.by)).toEqual([
      "initial",
      "model",
      "model",
      "repair",
      "fallback",
    ]);
    expect(result.repairs).toBe(MAX_REPAIRS + 1);
    expect(result.grade).toBe("great");
    expect(result.style.frame).toEqual({
      style: "banner-bottom",
      text: "Wi-Fi",
    });
    expect(result.changes.at(-1)).toMatch(/classic black-on-white/);
  });
});
