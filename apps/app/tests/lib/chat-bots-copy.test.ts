// The chat bots' copy against the code: the docs' "Style your code"
// sections list exactly the options and choices the bots take
// (lib/chat-bots/styles.ts), and no page, README or catalogue entry claims
// QRdx keeps nothing. Content and designs travel in image links, which can
// end up in logs and caches, so the honest wording is that QRdx doesn't
// save the codes.
import { readFileSync } from "node:fs";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { describe, expect, it } from "vitest";
import {
  CHAT_COLORS,
  CHAT_FLAGS,
  CHAT_FRAMES,
  CHAT_LOGOS,
  CHAT_LOOKS,
  PICKER_LABELS,
} from "@/lib/chat-bots/styles";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const docs = {
  slack: read("../../../docs/content/docs/slack-bot.mdx"),
  telegram: read("../../../docs/content/docs/telegram-bot.mdx"),
  discord: read("../../../docs/content/docs/discord-bot.mdx"),
};

/** Promises the bots can't keep: nothing kept, stored or logged anywhere. */
const OVERCLAIM =
  /nothing (?:is )?(?:kept|stored)|stores nothing|no database|keeps? nothing|(?:doesn't|does not|don't|won't) keep (?:what|anything)|never (?:kept|stored|logged)/i;

const entry = (slug: string) => {
  const found = getCatalogBySurface("integrations").find(
    (item) => item.slug === slug,
  );
  if (!found) throw new Error(`No ${slug} catalogue entry`);
  return JSON.stringify(found);
};

describe("Style your code, in the docs", () => {
  it.each(Object.keys(docs))("the %s page has the section", (bot) => {
    expect(docs[bot as keyof typeof docs]).toContain("Style your code");
  });

  it.each(["slack", "telegram"] as const)(
    "the %s page lists every typed option and look",
    (bot) => {
      for (const flag of CHAT_FLAGS) {
        expect(docs[bot], flag).toContain(`\`--${flag}\``);
      }
      for (const look of CHAT_LOOKS) {
        expect(docs[bot], look.id).toContain(`\`${look.id}\``);
      }
      for (const color of CHAT_COLORS) {
        expect(docs[bot], color.id).toContain(`\`${color.id}\``);
      }
    },
  );

  it("the Discord page names /qr's choices as Discord shows them", () => {
    for (const option of [...CHAT_LOOKS, ...CHAT_COLORS, ...CHAT_FRAMES]) {
      expect(docs.discord, option.label).toContain(option.label);
    }
    // The menus' extra picker.
    expect(CHAT_LOGOS.length).toBeGreaterThan(1);
    expect(docs.discord).toContain("**Logo**");
  });

  it("the landing pages' mockups name the menus as the bots do", () => {
    const mockups = read(
      "../../components/sections/chat-bots/chat-mockups.tsx",
    );
    expect(mockups).toContain(
      `const MENUS = [${Object.values(PICKER_LABELS)
        .map((label) => `"${label}"`)
        .join(", ")}] as const;`,
    );
  });

  it("every page says styled codes are checked so they scan", () => {
    for (const page of Object.values(docs)) {
      expect(page).toMatch(/same scan score as the editor/);
    }
  });
});

describe("the bots promise nothing they can't keep", () => {
  const sources: Record<string, () => string> = {
    "slack docs": () => docs.slack,
    "telegram docs": () => docs.telegram,
    "discord docs": () => docs.discord,
    "discord-bot catalogue entry": () => entry("discord-bot"),
    "slack catalogue entry": () => entry("slack"),
    "plugins/discord/README.md": () =>
      read("../../../../plugins/discord/README.md"),
    "plugins/slack/README.md": () =>
      read("../../../../plugins/slack/README.md"),
  };

  it.each(Object.keys(sources))("%s", (name) => {
    const text = sources[name]!();
    expect(text.match(OVERCLAIM)?.[0] ?? null).toBeNull();
  });

  it("the Discord entry says no account is needed, not that nothing is stored", () => {
    const discord = entry("discord-bot");
    expect(discord).toContain('"title":"No account needed"');
    expect(discord).toContain(
      "No QRdx account, and replies never ping anyone.",
    );
    expect(discord).not.toContain("Nothing stored");
  });
});
