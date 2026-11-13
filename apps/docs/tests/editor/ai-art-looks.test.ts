// Quick looks and "Write one for me" for AI QR art: the looks catalogue
// (components/sections/ai-art/looks.ts), composing a look into the prompt and
// writing a missing description (lib/ai/art-prompt.ts, with a fake model),
// the request schemas, and the Art tab's form helpers. No network, no model.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  ART_NEGATIVE_PROMPT_MAX_LENGTH,
  ART_PROMPT_MAX_LENGTH,
  ART_STYLE_ID_MAX_LENGTH,
  aiArtRequestSchema,
  artDescribeRequestSchema,
} from "@/components/sections/ai-art/config";
import {
  ART_LOOK_IDS,
  ART_LOOK_WORDS_MAX_LENGTH,
  ART_LOOKS,
  artLookPreview,
  findArtLook,
} from "@/components/sections/ai-art/looks";
import type { ArtWriterCall } from "@/lib/ai/art-prompt";
import en from "@/messages/en.json";

// Writer failures are logged; keep the output quiet and check what's logged.
const logged = vi.hoisted(() => ({ errors: [] as unknown[][] }));
vi.mock("@/lib/shared", () => ({
  logError: (...args: unknown[]) => logged.errors.push(args),
}));

const {
  ART_WRITER_INSTRUCTIONS,
  cleanWrittenPrompt,
  composeArtPrompt,
  composeAvoid,
  writeArtPrompt,
} = await import("@/lib/ai/art-prompt");
const { artRequestFor, canGenerate, parseArtGenerateIntent } = await import(
  "@/components/editor/art/ai-art-intent"
);
const { DEFAULT_AI_ART_DRAFT } = await import("@/store/art-session-store");

const PUBLIC = join(import.meta.dirname, "../../public");
const base = { text: "https://qrdx.dev" };

/** A real photo-sized PNG as a data URL (no file from the web). */
const photoDataUrl = async (width = 900, height = 600) => {
  const png = await sharp({
    create: { width, height, channels: 3, background: "#3b7a57" },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
};

/** A fake text model that records each call and answers with `reply`. */
const fakeWriter = (reply: string | (() => Promise<string>)) => {
  const calls: ArtWriterCall[] = [];
  return {
    calls,
    write: async (call: ArtWriterCall) => {
      calls.push(call);
      return typeof reply === "string" ? reply : reply();
    },
  };
};

describe("the looks", () => {
  it("are a short list with unique, schema-sized ids and labels", () => {
    expect(ART_LOOKS.length).toBeGreaterThanOrEqual(8);
    expect(ART_LOOKS.length).toBeLessThanOrEqual(16);
    expect(new Set(ART_LOOK_IDS).size).toBe(ART_LOOKS.length);
    expect(new Set(ART_LOOKS.map((look) => look.label)).size).toBe(
      ART_LOOKS.length,
    );
    for (const look of ART_LOOKS) {
      expect(look.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(look.id.length).toBeLessThanOrEqual(ART_STYLE_ID_MAX_LENGTH);
      expect(look.words.length).toBeLessThanOrEqual(ART_LOOK_WORDS_MAX_LENGTH);
      expect(look.words).not.toMatch(/[.\s]$/);
      if ("avoid" in look) {
        expect(look.avoid.length).toBeLessThanOrEqual(
          ART_LOOK_WORDS_MAX_LENGTH,
        );
      }
    }
  });

  it("name no artists, brands or characters", () => {
    const names =
      /\b(van gogh|monet|picasso|hokusai|klimt|mucha|warhol|lichtenstein|ghibli|disney|pixar|lego|polaroid|kodak|minecraft|pokemon|marvel|unreal|octane)\b/i;
    for (const look of ART_LOOKS) {
      expect(`${look.label} ${look.words}`).not.toMatch(names);
    }
  });

  it("each have a small preview that scanned, and none left over", () => {
    for (const look of ART_LOOKS) {
      const file = join(PUBLIC, artLookPreview(look.id));
      expect(existsSync(file), `no preview for ${look.id}`).toBe(true);
      expect(statSync(file).size).toBeLessThan(16 * 1024);
    }
    const stray = readdirSync(join(PUBLIC, "images/ai-art-looks")).filter(
      (file) => !findArtLook(file.replace(/\.webp$/, "")),
    );
    expect(stray).toEqual([]);
  });

  it("are listed, every one and in order, in the AI art API docs", () => {
    const mdx = readFileSync(
      join(import.meta.dirname, "../../content/docs/developers/ai-art-api.mdx"),
      "utf8",
    );
    const section = mdx.slice(
      mdx.indexOf("## Quick looks"),
      mdx.indexOf("## A prompt written for you"),
    );
    const rows = [...section.matchAll(/^\| `([a-z-]+)` \| ([^|]+) \|$/gm)]
      // The header row names the column `style`.
      .filter(([, id]) => id !== "style")
      .map(([, id, label]) => ({ id, label: label?.trim() }));
    expect(rows).toEqual(
      ART_LOOKS.map((look) => ({ id: look.id, label: look.label })),
    );
  });

  it("each have a label in the catalog the chips read", () => {
    const labels = en.editor.art.artLooks.looks as Record<string, string>;
    expect(Object.keys(labels).sort()).toEqual([...ART_LOOK_IDS].sort());
    for (const look of ART_LOOKS) expect(labels[look.id]).toBe(look.label);
  });
});

describe("composeArtPrompt", () => {
  it("adds each look's words after the description, and its things to avoid", () => {
    for (const look of ART_LOOKS) {
      const composed = composeArtPrompt("a koi pond in the rain.", look.id);
      expect(composed.prompt).toBe(`a koi pond in the rain, ${look.words}`);
      expect(composed.avoid).toBe("avoid" in look ? look.avoid : undefined);
    }
  });

  it("leaves the description as it is without a look, or with an unknown one", () => {
    expect(composeArtPrompt(" a zen garden. ")).toEqual({
      prompt: "a zen garden",
    });
    expect(composeArtPrompt("a zen garden", null)).toEqual({
      prompt: "a zen garden",
    });
    expect(composeArtPrompt("a zen garden", "sepia")).toEqual({
      prompt: "a zen garden",
    });
  });

  it("stays within the description's limit plus the longest look", () => {
    const longest = "x".repeat(ART_PROMPT_MAX_LENGTH);
    for (const look of ART_LOOKS) {
      expect(
        composeArtPrompt(longest, look.id).prompt.length,
      ).toBeLessThanOrEqual(
        ART_PROMPT_MAX_LENGTH + 2 + ART_LOOK_WORDS_MAX_LENGTH,
      );
    }
  });

  it("joins the person's things to avoid with the look's, theirs first and within the limit", () => {
    expect(composeAvoid(undefined, undefined)).toBeUndefined();
    expect(composeAvoid("people.", undefined)).toBe("people");
    expect(composeAvoid(undefined, "color")).toBe("color");
    expect(composeAvoid("people", "color")).toBe("people, color");
    const full = "y".repeat(ART_NEGATIVE_PROMPT_MAX_LENGTH);
    expect(composeAvoid(full, "color")).toBe(full);
  });
});

describe("the request schemas", () => {
  it("allow a blank description (one is written) but not a too-short one", () => {
    expect(aiArtRequestSchema.parse(base).prompt).toBeUndefined();
    expect(aiArtRequestSchema.parse({ ...base, prompt: "   " }).prompt).toBe(
      undefined,
    );
    expect(
      aiArtRequestSchema.parse({ ...base, prompt: " a cat " }).prompt,
    ).toBe("a cat");
    expect(
      aiArtRequestSchema.safeParse({ ...base, prompt: "ab" }).success,
    ).toBe(false);
    expect(
      aiArtRequestSchema.safeParse({
        ...base,
        prompt: "x".repeat(ART_PROMPT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("take known looks only", () => {
    for (const id of ART_LOOK_IDS) {
      expect(aiArtRequestSchema.parse({ ...base, style: id }).style).toBe(id);
    }
    for (const style of ["sepia", "", "WATERCOLOR", 3]) {
      expect(aiArtRequestSchema.safeParse({ ...base, style }).success).toBe(
        false,
      );
    }
  });

  it("describe requests: defaults, a blank hint dropped, the photo rules", async () => {
    expect(artDescribeRequestSchema.parse({})).toEqual({ mode: "code" });
    expect(artDescribeRequestSchema.parse({ hint: "  " }).hint).toBeUndefined();
    expect(artDescribeRequestSchema.safeParse({ style: "sepia" }).success).toBe(
      false,
    );
    const photo = await photoDataUrl(40, 40);
    expect(
      artDescribeRequestSchema.safeParse({ mode: "photo", photo }).success,
    ).toBe(true);
    expect(artDescribeRequestSchema.safeParse({ mode: "photo" }).success).toBe(
      false,
    );
    expect(artDescribeRequestSchema.safeParse({ photo }).success).toBe(false);
    expect(
      artDescribeRequestSchema.safeParse({
        mode: "photo",
        photo: "https://example.com/me.png",
      }).success,
    ).toBe(false);
  });
});

describe("writeArtPrompt (fake model)", () => {
  it("asks for one concrete scene for the mode, the look and the hint, with no text or names", async () => {
    const fake = fakeWriter("A lighthouse on a cliff at dusk.");
    await writeArtPrompt(
      { mode: "code", look: "watercolor", hint: "something by the sea" },
      { write: fake.write },
    );
    const [call] = fake.calls;
    expect(call?.instructions).toBe(ART_WRITER_INSTRUCTIONS);
    expect(call?.instructions).toMatch(/subject, a setting and the light/);
    expect(call?.instructions).toMatch(
      /text, letters, numbers, signs, logos, brands, artists' names, real people/,
    );
    expect(call?.text).toMatch(/squares of the QR code/);
    expect(call?.text).toMatch(/"Watercolor"/);
    expect(call?.text).toMatch(/don't name a style or medium/);
    expect(call?.text).toMatch(/something by the sea/);
    expect(call?.image).toBeUndefined();

    const scene = fakeWriter("A tiled courtyard at noon.");
    await writeArtPrompt({ mode: "scene" }, { write: scene.write });
    expect(scene.calls[0]?.text).toMatch(/large, fairly flat surface/);
    expect(scene.calls[0]?.text).not.toMatch(/look/);
    expect(scene.calls[0]?.text).toMatch(/Surprise me/);
  });

  it("sends the photo in photo mode only, downscaled to a JPEG", async () => {
    const photo = await photoDataUrl(900, 600);
    const fake = fakeWriter("A green field under soft morning light.");
    await writeArtPrompt({ mode: "photo", photo }, { write: fake.write });
    const image = fake.calls[0]?.image;
    expect(image).toBeInstanceOf(Uint8Array);
    const meta = await sharp(image).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(384);
    expect(fake.calls[0]?.text).toMatch(/attached photo/);

    const code = fakeWriter("A green field.");
    await writeArtPrompt({ mode: "code", photo }, { write: code.write });
    expect(code.calls[0]?.image).toBeUndefined();
  });

  it("refuses a photo it can't read", async () => {
    const fake = fakeWriter("unused words");
    await expect(
      writeArtPrompt(
        { mode: "photo", photo: "data:image/png;base64,AAAA" },
        { write: fake.write },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fake.calls).toHaveLength(0);
  });

  it("trims the reply to one clean line and caps its length at a word", async () => {
    const fake = fakeWriter(
      '  Description: "A fox\n in the snow,   under a pale moon."  ',
    );
    expect(await writeArtPrompt({ mode: "code" }, { write: fake.write })).toBe(
      "A fox in the snow, under a pale moon.",
    );
    const long = `${"word ".repeat(120)}end`;
    const capped = cleanWrittenPrompt(long);
    expect(capped.length).toBeLessThanOrEqual(ART_PROMPT_MAX_LENGTH);
    expect(capped.endsWith("word")).toBe(true);
    expect(
      aiArtRequestSchema.safeParse({ ...base, prompt: capped }).success,
    ).toBe(true);
  });

  it("surfaces a failed or empty reply as a 502, logging only the error", async () => {
    logged.errors.length = 0;
    const failing = fakeWriter(async () => {
      throw new Error("gateway down");
    });
    const photo = await photoDataUrl(60, 60);
    await expect(
      writeArtPrompt({ mode: "photo", photo }, { write: failing.write }),
    ).rejects.toMatchObject({ status: 502, code: "AI_ART_DESCRIBE_FAILED" });
    expect(logged.errors).toHaveLength(1);
    expect(JSON.stringify(logged.errors)).not.toContain("base64");

    for (const reply of ["", "   ", '""', "Sure"]) {
      await expect(
        writeArtPrompt({ mode: "code" }, { write: fakeWriter(reply).write }),
      ).rejects.toMatchObject({ status: 502 });
    }
  });

  it("gives up at its own deadline, and passes a cancel straight through", async () => {
    const waitForAbort = (call: ArtWriterCall) =>
      new Promise<string>((_, reject) =>
        call.signal.addEventListener("abort", () => reject(call.signal.reason)),
      );
    await expect(
      writeArtPrompt({ mode: "code" }, { write: waitForAbort, timeoutMs: 20 }),
    ).rejects.toMatchObject({ status: 502, code: "AI_ART_DESCRIBE_FAILED" });

    const controller = new AbortController();
    const cancelled = writeArtPrompt(
      { mode: "code", signal: controller.signal },
      { write: waitForAbort },
    );
    controller.abort(new Error("cancelled"));
    await expect(cancelled).rejects.toThrow("cancelled");
  });
});

describe("the Art tab's form with looks", () => {
  const TEXT = "https://qrdx.dev/q/Ab3dE9x";

  it("sends the look and leaves a blank description out", () => {
    expect(
      artRequestFor(TEXT, { ...DEFAULT_AI_ART_DRAFT, look: "pixel-art" }),
    ).toEqual({
      text: TEXT,
      style: "pixel-art",
      visibility: DEFAULT_AI_ART_DRAFT.visibility,
      creativity: DEFAULT_AI_ART_DRAFT.creativity,
    });
  });

  it("can generate with a blank description, not with a too-short one", () => {
    expect(canGenerate(TEXT, DEFAULT_AI_ART_DRAFT)).toBe(true);
    expect(canGenerate(TEXT, { ...DEFAULT_AI_ART_DRAFT, prompt: "ab" })).toBe(
      false,
    );
  });

  it("keeps a known look across sign-in and drops anything else", () => {
    const draft = { ...DEFAULT_AI_ART_DRAFT, look: "ink" as const };
    expect(parseArtGenerateIntent({ text: TEXT, draft })?.draft.look).toBe(
      "ink",
    );
    const { look: _, ...older } = draft;
    expect(
      parseArtGenerateIntent({ text: TEXT, draft: older })?.draft.look,
    ).toBeNull();
    expect(
      parseArtGenerateIntent({ text: TEXT, draft: { ...draft, look: "sepia" } })
        ?.draft.look,
    ).toBeNull();
  });
});
