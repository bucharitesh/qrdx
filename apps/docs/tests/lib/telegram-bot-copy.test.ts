// The Telegram bot's privacy copy stays honest. The content of every code
// travels in an image link, and links end up in request logs and CDN caches,
// so no Telegram copy may say QRdx keeps nothing. The wording matches the
// Discord bot's docs: QRdx doesn't save the codes, the content goes into the
// image link, so don't make codes of secrets.
import { readFileSync } from "node:fs";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { describe, expect, it } from "vitest";
import { helpText } from "@/lib/chat-bots/telegram/replies";
import {
  DESCRIPTION,
  SHORT_DESCRIPTION,
} from "../../../../plugins/telegram/scripts/setup.mjs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/** Promises the bot can't keep: nothing kept, stored or logged anywhere. */
const OVERCLAIM =
  /nothing (?:is )?(?:kept|stored)|nothing you send is kept|keeps? nothing|(?:doesn't|does not|don't|won't) keep (?:what|anything)|without being (?:saved|kept|stored)|never (?:kept|stored|logged)/i;

const telegramEntry = () => {
  const entry = getCatalogBySurface("integrations").find(
    (item) => item.slug === "telegram",
  );
  if (!entry) throw new Error("No telegram catalogue entry");
  return JSON.stringify(entry);
};

const sources: Record<string, () => string> = {
  "lib/chat-bots/telegram/replies.ts": () =>
    read("../../lib/chat-bots/telegram/replies.ts"),
  "help text": () => helpText("QRdxTestBot"),
  "content/docs/telegram-bot.mdx": () =>
    read("../../content/docs/telegram-bot.mdx"),
  "catalogue entry (telegram)": telegramEntry,
  "plugins/telegram/scripts/setup.mjs": () =>
    read("../../../../plugins/telegram/scripts/setup.mjs"),
  "plugins/telegram/README.md": () =>
    read("../../../../plugins/telegram/README.md"),
};

describe("Telegram bot privacy copy", () => {
  it.each(Object.keys(sources))("%s promises nothing it can't keep", (name) => {
    const text = sources[name]!();
    expect(text.length).toBeGreaterThan(0);
    expect(text.match(OVERCLAIM)?.[0] ?? null).toBeNull();
  });

  it.each([
    ["help text", () => helpText("QRdxTestBot")],
    ["docs page", sources["content/docs/telegram-bot.mdx"]!],
    ["catalogue entry", telegramEntry],
    ["bot description", () => DESCRIPTION],
  ])(
    "the %s says where the content goes and to keep secrets out",
    (_, text) => {
      expect(text()).toContain("doesn't save the codes");
      expect(text()).toMatch(/logs and caches/);
      expect(text()).toMatch(/passwords or other secrets/);
    },
  );

  it("the bot's descriptions stay within Telegram's limits", () => {
    expect(DESCRIPTION.length).toBeLessThanOrEqual(512);
    expect(SHORT_DESCRIPTION.length).toBeLessThanOrEqual(120);
  });
});
