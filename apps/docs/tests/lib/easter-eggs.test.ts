import { describe, expect, it } from "vitest";
import { easterEggs, getEasterEgg } from "@/lib/easter-eggs";

const DIRECT_IMAGE = /^https:\/\/[^/]+\/.+\.(?:jpe?g|png|gif|webp)$/i;
const YOUTUBE_PLAYER =
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}(?:\?|$)/;

describe("easter-egg destinations", () => {
  it.each(
    Object.entries(easterEggs),
  )("%s opens the media itself, not a page about it", (_slug, egg) => {
    expect(
      DIRECT_IMAGE.test(egg.url) || YOUTUBE_PLAYER.test(egg.url),
      egg.url,
    ).toBe(true);
  });

  it("never points at meme or GIF article pages", () => {
    for (const egg of Object.values(easterEggs)) {
      expect(egg.url).not.toMatch(
        /knowyourmeme\.com\/memes|giphy\.com\/gifs|youtube\.com\/watch/,
      );
    }
  });

  it("looks slugs up case-insensitively and ignores unknown ones", () => {
    expect(getEasterEgg("LOST")?.url).toBe(easterEggs.lost.url);
    expect(getEasterEgg("constructor")).toBeNull();
    expect(getEasterEgg("nope")).toBeNull();
  });
});
