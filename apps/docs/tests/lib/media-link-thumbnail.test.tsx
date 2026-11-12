// The YouTube / Spotify link helper (components/data-connections/
// media-link-assist.tsx) only shows an https thumbnail, whatever the
// provider's oEmbed reply or the parsed link handed it. Rendered to static
// markup, so the oEmbed preview (an effect) isn't fetched here.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

/** What youTubeThumbnailUrl returns in a test; null: the real one. */
let thumbnailOverride: string | null = null;

vi.mock(
  "@repo/integrations/src/integrations/youtube/parser",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@repo/integrations/src/integrations/youtube/parser")
      >();
    return {
      ...actual,
      youTubeThumbnailUrl: (
        link: Parameters<typeof actual.youTubeThumbnailUrl>[0],
      ) => thumbnailOverride ?? actual.youTubeThumbnailUrl(link),
    };
  },
);
vi.mock("@/components/data-connections/source-picker", () => ({
  AccountSourcePicker: () => null,
}));
vi.mock("@/components/editor/sound", () => ({ emitSound: () => {} }));
vi.mock("@/lib/data-connections/client", () => ({
  isIntegrationsMock: () => false,
}));

const { MediaLinkAssist } = await import(
  "@/components/data-connections/media-link-assist"
);

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const html = () =>
  renderIntl(
    <MediaLinkAssist kind="youtube" onApply={() => {}} value={VIDEO} />,
  );

describe("MediaLinkAssist thumbnail", () => {
  beforeEach(() => {
    thumbnailOverride = null;
  });

  it("shows the https thumbnail of a parsed video", () => {
    expect(html()).toContain(
      'src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"',
    );
  });

  it("drops a thumbnail that isn't https", () => {
    for (const url of [
      "http://img.example/thumb.jpg",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "//img.example/thumb.jpg",
    ]) {
      thumbnailOverride = url;
      const markup = html();
      expect(markup, url).not.toContain("<img");
      // The rest of the card still renders.
      expect(markup, url).toContain("www.youtube.com/watch?v=dQw4w9WgXcQ");
    }
  });
});
