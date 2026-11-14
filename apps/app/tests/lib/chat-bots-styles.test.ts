// The chat bots' style layer (lib/chat-bots/styles.ts): the curated looks,
// colors, frames and logos, typed options, the links a design travels in,
// and the scan check every styled code passes. The scan check is the real
// one (design_qr's scoreDesign and repair loop); no network or database.
import type { ScanScoreResult } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  applyChoice,
  CHAT_COLORS,
  CHAT_FRAMES,
  CHAT_LOGOS,
  CHAT_LOOKS,
  type ChatDesign,
  chatDesignLinks,
  checkChatDesign,
  currentOptions,
  designFromParams,
  pickerChoice,
  readChatQrAsk,
  readChatQrLink,
  readChatStyleFlags,
  STYLE_NOTES,
} from "@/lib/chat-bots/styles";
import { decodeStyleParam } from "@/lib/playground-style";
import { scoreDesign } from "@/lib/qr-design/score";
import { contrastRatio } from "@/lib/themes/color";
import { defaultPresets } from "@/utils/qr-presets";
import { createRandom } from "../support/prng";

/** A typical link, as people send them. */
const LINK = "https://qrdx.dev/menu";

/**
 * Each scan check renders and decodes the code (about 0.2 s alone, several
 * times that when every suite runs at once).
 */
const SCANS = { timeout: 180_000 };

const design = (choice: Parameters<typeof applyChoice>[1]) =>
  applyChoice(null, choice) as ChatDesign;

/** The design as the image API draws it, scored again from scratch. */
async function scoreOf(data: string, checked: ChatDesign) {
  return scoreDesign(data, {
    fgColor: "#000000",
    bgColor: "#ffffff",
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
    level: "Q",
    margin: 4,
    ...checked.styles,
    showLogo: Boolean(checked.logo),
  });
}

describe("what the pickers offer", () => {
  it("is a short list: 6 to 10 built-in looks, about 6 colors, a few frames and logos", () => {
    const looks = CHAT_LOOKS.filter((look) => look.id !== "plain");
    expect(looks.length).toBeGreaterThanOrEqual(6);
    expect(looks.length).toBeLessThanOrEqual(10);
    for (const look of looks) {
      // The editor's own presets, under the editor's names.
      expect(defaultPresets[look.id]?.label).toBe(look.label);
    }
    expect(CHAT_COLORS).toHaveLength(6);
    expect(CHAT_FRAMES[0]?.id).toBe("none");
    expect(CHAT_LOGOS[0]?.id).toBe("none");
    // Each picker fits a Telegram row of 3 in at most 3 rows, and Slack's 100.
    for (const list of [CHAT_LOOKS, CHAT_COLORS, CHAT_FRAMES, CHAT_LOGOS]) {
      expect(list.length).toBeLessThanOrEqual(9);
    }
  });

  it("only offers colors dark enough to scan small: 7:1 on white", () => {
    for (const color of CHAT_COLORS) {
      expect(
        contrastRatio(color.hex, "#FFFFFF"),
        color.id,
      ).toBeGreaterThanOrEqual(7);
    }
  });

  // Every look on its own and with each color, frame and the logo (the scan
  // check scores any logo by the same footprint) is Great as it is: the
  // check sends it unchanged.
  it.each(CHAT_LOOKS.map((look) => look.id))(
    "%s scans as it is with every color, frame and the logo",
    async (look) => {
      const choices = [
        {},
        ...CHAT_COLORS.map((color) => pickerChoice("color", color.id) ?? {}),
        ...CHAT_FRAMES.slice(1).map((frame) => ({
          frame: frame.id as "banner-bottom",
        })),
        { logo: "link" as const },
      ];
      for (const choice of choices) {
        const asked = applyChoice(null, { look, ...choice });
        const checked = await checkChatDesign(LINK, asked);
        expect(checked.note, JSON.stringify(choice)).toBeNull();
        expect(checked.design).toEqual(
          asked === null ? null : expect.objectContaining({ look: asked.look }),
        );
      }
    },
    SCANS.timeout,
  );

  it("scans in any mix of the four pickers", SCANS, async () => {
    const random = createRandom(20261111);
    for (let i = 0; i < 6; i++) {
      const asked = applyChoice(null, {
        ...pickerChoice("look", random.pick(CHAT_LOOKS).id),
        ...pickerChoice("color", random.pick(CHAT_COLORS).id),
        ...pickerChoice("frame", random.pick(CHAT_FRAMES).id),
        ...pickerChoice("logo", random.pick(CHAT_LOGOS).id),
      });
      const checked = await checkChatDesign(LINK, asked);
      if (checked.design) {
        expect((await scoreOf(LINK, checked.design)).grade).toBe("great");
      }
    }
  });
});

describe("the scan check", () => {
  it("sends the plain code as it is, without scoring it", async () => {
    const score = async () => {
      throw new Error("scored");
    };
    expect(await checkChatDesign(LINK, null, score)).toEqual({
      design: null,
      note: null,
    });
  });

  it("repairs a color too light to scan, and says so", SCANS, async () => {
    const asked = design({ fg: "#CCCCCC" });
    const checked = await checkChatDesign(LINK, asked);
    expect(checked.note).toBe("adjusted");
    const fg = String(checked.design?.styles.fgColor);
    expect(contrastRatio(fg, "#FFFFFF")).toBeGreaterThan(
      contrastRatio("#CCCCCC", "#FFFFFF"),
    );
    expect((await scoreOf(LINK, checked.design as ChatDesign)).grade).toBe(
      "great",
    );
  });

  it("falls back to black on white when nothing else scans, and says so", async () => {
    // A scorer that passes only the classic fallback.
    const score = async (_value: string, style: { fgColor?: unknown }) =>
      ({
        score: style.fgColor === "#000000" ? 95 : 40,
        grade: style.fgColor === "#000000" ? "great" : "fails",
        checks: [
          { id: "contrast", passed: style.fgColor === "#000000", message: "" },
        ],
      }) as unknown as ScanScoreResult;
    const checked = await checkChatDesign(
      LINK,
      design({ look: "royal", frame: "banner-bottom", frameText: "Menu" }),
      score,
    );
    expect(checked.note).toBe("fallback");
    // The classic code keeps the frame and its text; the look is gone.
    expect(checked.design?.look).toBeNull();
    expect(checked.design?.styles.frame).toMatchObject({
      style: "banner-bottom",
      text: "Menu",
    });
    expect(String(checked.design?.styles.fgColor).toUpperCase()).toBe(
      "#000000",
    );
  });

  it("falls back to the plain code when even that won't do", async () => {
    const never = async () =>
      ({
        score: 30,
        grade: "fails",
        checks: [{ id: "decode-96", passed: false, message: "" }],
      }) as unknown as ScanScoreResult;
    expect(
      await checkChatDesign(LINK, design({ look: "modern" }), never),
    ).toEqual({ design: null, note: "fallback" });
  });

  it(
    "ends Great or plain for long content, which most looks can't hold",
    SCANS,
    async () => {
      const long = `https://example.com/${"a".repeat(200)}`;
      const checked = await checkChatDesign(long, design({ look: "blossom" }));
      expect(checked.note).not.toBeNull();
      if (checked.design) {
        expect((await scoreOf(long, checked.design)).grade).toBe("great");
      }
    },
  );

  it("raises error correction for a logo", SCANS, async () => {
    const checked = await checkChatDesign(LINK, design({ logo: "wifi" }));
    expect(checked.design?.logo).toBe("wifi");
    expect(checked.design?.styles.level).toBe("H");
  });

  it("has a short note for each outcome", () => {
    for (const note of Object.values(STYLE_NOTES)) {
      expect(note.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("typed options", () => {
  it("reads every option, with the CLI's names", () => {
    const read = readChatStyleFlags(
      'qrdx.dev --look modern --fg 0051ff --bg #fff --eye-color 111111 --dot-color red --body circle --eye gear --dot rounded --frame banner-bottom --frame-text "Scan me" --template arrow --logo wifi',
    );
    expect(read).toEqual({
      ok: true,
      content: "qrdx.dev",
      choice: {
        look: "modern",
        fg: "#0051FF",
        bg: "#FFFFFF",
        eyeColor: "#111111",
        dotColor: "#991B1B",
        body: "circle",
        eye: "gear",
        dot: "rounded",
        frame: "banner-bottom",
        frameText: "Scan me",
        template: "Arrow",
        logo: "wifi",
      },
    });
  });

  it("takes the spec's example", () => {
    const ask = readChatQrAsk(
      'qrdx.dev --look modern --fg 0051ff --frame banner-bottom --frame-text "Scan me"',
    );
    expect(ask).toMatchObject({ ok: true, data: "https://qrdx.dev" });
    const asked = ask.ok ? ask.design : null;
    expect(asked?.look).toBe("modern");
    expect(asked?.styles).toMatchObject({
      fgColor: "#0051FF",
      eyeColor: "#0051FF",
      bodyPattern: "rounded",
      frame: { style: "banner-bottom", text: "Scan me" },
    });
  });

  it("takes quoted frame text in straight or curly quotes, or unquoted up to the next option", () => {
    for (const typed of [
      'x --frame-text "Scan for the menu"',
      "x --frame-text “Scan for the menu”",
      "x --frame-text 'Scan for the menu'",
      "x --frame-text Scan for the menu --logo none",
    ]) {
      const read = readChatStyleFlags(typed);
      expect(read.ok && read.choice?.frameText, typed).toBe(
        "Scan for the menu",
      );
    }
    // A quoted value keeps a -- inside it.
    const quoted = readChatStyleFlags('x --frame-text "a --b" --frame badge');
    expect(quoted).toMatchObject({
      ok: true,
      choice: { frameText: "a --b", frame: "badge" },
    });
  });

  it("keeps -- inside a link as content", () => {
    const read = readChatStyleFlags(
      "https://example.com/a--b?q=c--d --look royal",
    );
    expect(read).toEqual({
      ok: true,
      content: "https://example.com/a--b?q=c--d",
      choice: { look: "royal" },
    });
    // No space before it: not an option.
    expect(readChatStyleFlags("https://example.com/x--look")).toEqual({
      ok: true,
      content: "https://example.com/x--look",
      choice: null,
    });
    // A dash on its own isn't an option either.
    expect(readChatStyleFlags("Lunch -- 12:30")).toMatchObject({
      choice: null,
    });
  });

  it("reads the dashes phones type for --", () => {
    for (const typed of ["qrdx.dev —look royal", "qrdx.dev –look royal"]) {
      expect(readChatStyleFlags(typed)).toEqual({
        ok: true,
        content: "qrdx.dev",
        choice: { look: "royal" },
      });
    }
  });

  it("takes a look by its name too, and --color for --fg", () => {
    expect(readChatStyleFlags("x --look Bordeaux --color blue")).toMatchObject({
      ok: true,
      choice: { look: "bordeaux", fg: "#1E40AF" },
    });
  });

  it("explains an unknown option or value with the valid ones", () => {
    const cases: [string, RegExp][] = [
      ["x --colour blue", /no option --colour\. Options: --look, --fg/],
      ["x --look neon", /no look "neon"\. --look takes one of: plain, classic/],
      ["x --fg bluish", /--fg takes a hex color like 0051ff, or one of: black/],
      ["x --body blob", /no dot shape "blob".*square/],
      ["x --frame cloud", /no frame "cloud".*banner-bottom/],
      ["x --logo cat", /no logo icon "cat".*wifi/],
      ["x --template wavy", /no template frame "wavy".*Arrow/],
      [`x --frame-text "${"a".repeat(25)}"`, /up to 24 characters/],
      ["x --look", /--look needs a value/],
      ['x --frame-text ""', /--frame-text needs a value/],
    ];
    for (const [typed, message] of cases) {
      const read = readChatStyleFlags(typed);
      expect(read.ok, typed).toBe(false);
      expect(read.ok ? "" : read.message, typed).toMatch(message);
      expect(read.ok ? 0 : read.message.length, typed).toBeLessThan(400);
    }
    expect(readChatQrAsk("x --look neon")).toMatchObject({
      ok: false,
      reason: "options",
    });
  });

  it("is plain content without options, and empty content with only options", () => {
    expect(readChatQrAsk("Fish & chips")).toMatchObject({
      ok: true,
      data: "Fish & chips",
      design: null,
    });
    expect(readChatQrAsk("--look royal")).toEqual({
      ok: false,
      reason: "empty",
    });
    // Options that add up to the plain code are the plain code.
    expect(readChatQrAsk("x --look plain --frame none")).toMatchObject({
      ok: true,
      design: null,
    });
  });
});

describe("the links a design travels in", () => {
  const styled = design({
    look: "royal",
    frame: "banner-bottom",
    frameText: "Menu",
    logo: "wifi",
  });

  it("put the style and logo on both images, and the style on the editor link", () => {
    const links = chatDesignLinks(LINK, styled);
    const png = new URL(links.png);
    const svg = new URL(links.svg);
    for (const image of [png, svg]) {
      expect(image.origin + image.pathname).toBe("https://api.qrdx.dev/v1/qr");
      expect(image.searchParams.get("data")).toBe(LINK);
      expect(image.searchParams.get("logoIcon")).toBe("wifi");
    }
    const style = png.searchParams.get("style") ?? "";
    expect(svg.searchParams.get("style")).toBe(style);

    // "Open in editor" opens the same design: the editor's style value,
    // with the look as its preset, and the link after the #.
    const editor = new URL(links.editor);
    expect(editor.pathname).toBe("/playground");
    expect(editor.searchParams.get("style")).toBe(style);
    const decoded = decodeStyleParam(style);
    expect(decoded?.preset).toBe("royal");
    expect(decoded?.styles).toMatchObject({
      bodyPattern: defaultPresets.royal?.styles.bodyPattern,
      frame: { style: "banner-bottom", text: "Menu" },
    });
    expect(new URLSearchParams(editor.hash.slice(1)).get("url")).toBe(LINK);
    // Editor links never carry a logo.
    expect(editor.searchParams.has("logoIcon")).toBe(false);
  });

  it("never put text content in the editor link, even with a design", () => {
    const links = chatDesignLinks("Wi-Fi password: hunter2", styled);
    expect(links.editor).not.toContain("hunter2");
    expect(decodeURIComponent(links.editor)).not.toContain("hunter2");
    expect(new URL(links.editor).searchParams.has("style")).toBe(true);
  });

  it("leave the plain code's links as they were", () => {
    const links = chatDesignLinks(LINK, null);
    expect(new URL(links.png).searchParams.has("style")).toBe(false);
    expect(new URL(links.editor).search).toBe("");
  });

  it("read back to the same content and design", () => {
    for (const asked of [styled, null, design({ fg: "#0051FF" })]) {
      const links = chatDesignLinks("Table 4\nby the window", asked);
      for (const link of [links.png, links.svg]) {
        expect(readChatQrLink(link)).toEqual({
          data: "Table 4\nby the window",
          design: asked,
        });
      }
    }
  });

  it("read back nothing from links the bot didn't make", () => {
    const png = chatDesignLinks(LINK, styled).png;
    const other = new URL(png);
    other.host = "evil.example";
    const changed = (name: string, value: string) => {
      const url = new URL(png);
      url.searchParams.set(name, value);
      return url.toString();
    };
    for (const link of [
      other.toString(),
      changed("style", "1.not-a-style"),
      changed("style", '{"fgColor":"#000"}'),
      changed("logoIcon", "https://evil.example/logo.png"),
      changed("data", ""),
      "not a link",
      null,
    ]) {
      expect(readChatQrLink(link), String(link)).toBeNull();
    }
    expect(designFromParams(null, "cat")).toBeUndefined();
  });
});

describe("picking", () => {
  it("a look keeps the frame and logo, and replaces colors and shapes", () => {
    const framed = design({ frame: "polaroid", logo: "email", fg: "#6B21A8" });
    const next = applyChoice(framed, { look: "caffeine" }) as ChatDesign;
    expect(next.look).toBe("caffeine");
    expect(next.logo).toBe("email");
    expect(next.styles.frame).toEqual({ style: "polaroid" });
    expect(next.styles.fgColor).toBe(defaultPresets.caffeine?.styles.fgColor);
  });

  it("a color sets the dots and eyes on white, keeping the look's shapes", () => {
    const next = applyChoice(design({ look: "classic" }), {
      ...pickerChoice("color", "green"),
    }) as ChatDesign;
    expect(next.styles).toMatchObject({
      fgColor: "#14532D",
      eyeColor: "#14532D",
      dotColor: "#14532D",
      bgColor: "#FFFFFF",
      bodyPattern: defaultPresets.classic?.styles.bodyPattern,
    });
    expect(currentOptions(next)).toEqual({
      look: "classic",
      color: "green",
      frame: "none",
      logo: "none",
    });
  });

  it("back to plain, no frame and no logo is the plain code again", () => {
    let current = design({ look: "retro", frame: "banner-top", logo: "link" });
    for (const [picker, value] of [
      ["look", "plain"],
      ["frame", "none"],
      ["logo", "none"],
    ] as const) {
      current = applyChoice(
        current,
        pickerChoice(picker, value) ?? {},
      ) as ChatDesign;
    }
    expect(current).toBeNull();
    expect(currentOptions(null)).toEqual({
      look: "plain",
      color: "black",
      frame: "none",
      logo: "none",
    });
  });

  it("refuses options a picker doesn't offer", () => {
    expect(pickerChoice("look", "neon")).toBeNull();
    expect(pickerChoice("frame", "menu-card")).toBeNull();
    expect(pickerChoice("logo", "file")).toBeNull();
    expect(pickerChoice("color", "#123456")).toBeNull();
  });
});
