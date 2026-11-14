import { describe, expect, it } from "vitest";
import { CONTENT_EXAMPLES } from "@/components/editor/content-forms/content-examples";
import {
  contentTypeForDestination,
  DYNAMIC_CONTENT_TYPES,
  dynamicDestination,
  isDynamicContentType,
  NOT_OFFERED_DYNAMIC_TYPES,
  OTHER_DYNAMIC_TYPES,
  STATIC_ONLY_TYPES,
} from "@/lib/dynamic-content";
import { validateDesignContent } from "@/lib/qr-design/content";
import { CONTENT_TYPES_METADATA, type ContentType } from "@/types/qr-content";

const asFields = (example: object): Record<string, string> =>
  Object.fromEntries(
    Object.entries(example).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

describe("dynamic content types", () => {
  it("places every content type in exactly one list", () => {
    const lists: readonly ContentType[][] = [
      [...DYNAMIC_CONTENT_TYPES],
      [...STATIC_ONLY_TYPES],
      [...NOT_OFFERED_DYNAMIC_TYPES],
    ];
    for (const { type } of CONTENT_TYPES_METADATA) {
      const homes = lists.filter((list) => list.includes(type)).length;
      expect(homes, type).toBe(1);
    }
    const all = lists.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(CONTENT_TYPES_METADATA.length);
  });

  it("offers every web-address type but the website link under More types", () => {
    expect(OTHER_DYNAMIC_TYPES).not.toContain("url");
    expect(OTHER_DYNAMIC_TYPES.length).toBe(DYNAMIC_CONTENT_TYPES.length - 1);
  });

  it("makes a web address for each dynamic type's example", () => {
    for (const type of DYNAMIC_CONTENT_TYPES) {
      const result = dynamicDestination(type, asFields(CONTENT_EXAMPLES[type]));
      expect(result.ok, type).toBe(true);
      if (result.ok) expect(result.url, type).toMatch(/^https:\/\//);
    }
  });

  it("matches what the encoder makes of each static type's example", () => {
    for (const type of STATIC_ONLY_TYPES) {
      const result = validateDesignContent({
        type,
        ...CONTENT_EXAMPLES[type],
      } as Parameters<typeof validateDesignContent>[0]);
      expect(result.ok, type).toBe(true);
      if (result.ok) expect(result.value, type).not.toMatch(/^https?:/i);
    }
  });

  it("says which types can be dynamic", () => {
    expect(isDynamicContentType("whatsapp")).toBe(true);
    expect(isDynamicContentType("url")).toBe(true);
    expect(isDynamicContentType("wifi")).toBe(false);
    expect(isDynamicContentType("dubsh")).toBe(false);
    expect(isDynamicContentType(null)).toBe(false);
  });
});

describe("dynamicDestination", () => {
  it("encodes a WhatsApp chat as wa.me", () => {
    expect(
      dynamicDestination("whatsapp", {
        phoneNumber: "+1 202 555 0142",
        message: "Open on Sunday?",
      }),
    ).toEqual({
      ok: true,
      url: "https://wa.me/12025550142?text=Open%20on%20Sunday%3F",
    });
  });

  it("encodes a place as a Maps search", () => {
    const result = dynamicDestination("maps", {
      location: "Pike Place Market",
    });
    expect(result).toEqual({
      ok: true,
      url: "https://www.google.com/maps/search/?api=1&query=Pike%20Place%20Market",
    });
  });

  it("reports a missing required field by name", () => {
    const result = dynamicDestination("whatsapp", { phoneNumber: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.field).toBe("phoneNumber");
    }
  });

  it("reports an either-or type with neither filled", () => {
    const result = dynamicDestination("youtube", {
      channelUrl: "",
      videoUrl: "",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a spotify: link, which can't be redirected to", () => {
    const result = dynamicDestination("spotify", {
      uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/open\.spotify/);
  });

  it("takes an open.spotify.com link", () => {
    expect(
      dynamicDestination("spotify", {
        uri: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      }),
    ).toEqual({
      ok: true,
      url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    });
  });
});

describe("contentTypeForDestination", () => {
  it("stores what the builder's WhatsApp form makes as whatsapp, and nothing else", () => {
    // Each dynamic type's example, made into its destination by the builder.
    for (const type of DYNAMIC_CONTENT_TYPES) {
      const result = dynamicDestination(type, asFields(CONTENT_EXAMPLES[type]));
      if (!result.ok) continue;
      expect(contentTypeForDestination(result.url), type).toBe(
        type === "whatsapp" ? "whatsapp" : "url",
      );
    }
  });

  it("knows WhatsApp's other send links", () => {
    for (const url of [
      "https://api.whatsapp.com/send?phone=14155550132",
      "https://www.whatsapp.com/send/?phone=14155550132",
      "https://WA.ME/14155550132",
    ]) {
      expect(contentTypeForDestination(url), url).toBe("whatsapp");
    }
    expect(contentTypeForDestination("https://chat.whatsapp.com/Ab12")).toBe(
      "url",
    );
    expect(contentTypeForDestination("not a url")).toBe("url");
  });
});
