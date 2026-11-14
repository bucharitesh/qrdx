// The messaging, social, meeting, map, payment-link and crypto types added
// on 2026-11-11: what each encodes, what it accepts pasted, and what its
// form reports.
import { describe, expect, it } from "vitest";
import {
  discordSchema,
  signalSchema,
  telegramSchema,
} from "@/lib/validations/qr-content";
import type { QRContentConfig } from "@/types/qr-content";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";
import { parseURL } from "@/utils/url-parser";

const enc = (config: QRContentConfig) => encodeQRContent(config);

describe("encoders", () => {
  it.each<[QRContentConfig, string]>([
    // Telegram
    [{ type: "telegram", username: "@durov" }, "https://t.me/durov"],
    [
      { type: "telegram", username: "https://telegram.me/qrdx_channel/12" },
      "https://telegram.me/qrdx_channel/12",
    ],
    [
      { type: "telegram", username: "t.me/+AbCdEf123" },
      "https://t.me/+AbCdEf123",
    ],
    [
      { type: "telegram", phoneNumber: "+1 (415) 555-0132" },
      "https://t.me/+14155550132",
    ],
    // Signal
    [
      { type: "signal", phoneNumber: "0044 7700 900123" },
      "https://signal.me/#p/+447700900123",
    ],
    [
      { type: "signal", link: "https://signal.me/#eu/abc123XYZ" },
      "https://signal.me/#eu/abc123XYZ",
    ],
    [
      { type: "signal", link: "https://signal.group/#CjQKIabc" },
      "https://signal.group/#CjQKIabc",
    ],
    // Discord
    [{ type: "discord", invite: "abc123" }, "https://discord.gg/abc123"],
    [
      { type: "discord", invite: "https://discord.com/invite/qrdx-dev" },
      "https://discord.gg/qrdx-dev",
    ],
    [
      { type: "discord", invite: "discordapp.com/invite/abc123" },
      "https://discord.gg/abc123",
    ],
    // LINE
    [
      { type: "line", username: "my.line-id" },
      "https://line.me/ti/p/~my.line-id",
    ],
    [{ type: "line", username: "@shop123" }, "https://line.me/R/ti/p/@shop123"],
    [
      { type: "line", username: "https://lin.ee/AbCdEf" },
      "https://lin.ee/AbCdEf",
    ],
    // Bluesky
    [
      { type: "bluesky", handle: "@Alice" },
      "https://bsky.app/profile/alice.bsky.social",
    ],
    [
      { type: "bluesky", handle: "bsky.app" },
      "https://bsky.app/profile/bsky.app",
    ],
    [
      { type: "bluesky", handle: "https://bsky.app/profile/qrdx.dev" },
      "https://bsky.app/profile/qrdx.dev",
    ],
    [
      { type: "bluesky", handle: "did:plc:z72i7hdynmk6r22z27h6tvur" },
      "https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur",
    ],
    // Mastodon
    [
      { type: "mastodon", handle: "@Gargron@Mastodon.Social" },
      "https://mastodon.social/@Gargron",
    ],
    [
      { type: "mastodon", handle: "https://fosstodon.org/@qrdx" },
      "https://fosstodon.org/@qrdx",
    ],
    // Twitch, SoundCloud
    [{ type: "twitch", username: "Ninja" }, "https://www.twitch.tv/ninja"],
    [
      { type: "twitch", username: "https://www.twitch.tv/qrdx_dev" },
      "https://www.twitch.tv/qrdx_dev",
    ],
    [
      { type: "soundcloud", username: "@Forss" },
      "https://soundcloud.com/forss",
    ],
    [
      {
        type: "soundcloud",
        username: "https://soundcloud.com/forss/flickermood",
      },
      "https://soundcloud.com/forss/flickermood",
    ],
    // Meetings
    [
      { type: "zoom", meeting: "123 4567 8901" },
      "https://zoom.us/j/12345678901",
    ],
    [
      {
        type: "zoom",
        meeting: "https://us02web.zoom.us/j/12345678901?pwd=Ab12Cd",
      },
      "https://us02web.zoom.us/j/12345678901?pwd=Ab12Cd",
    ],
    [
      { type: "google-meet", meeting: "ABCDEFGHIJ" },
      "https://meet.google.com/abc-defg-hij",
    ],
    [
      {
        type: "google-meet",
        meeting: "https://meet.google.com/abc-defg-hij?authuser=1",
      },
      "https://meet.google.com/abc-defg-hij",
    ],
    // Waze
    [
      { type: "waze", location: "+48.8584, 2.2945" },
      "https://waze.com/ul?ll=48.8584,2.2945&navigate=yes",
    ],
    [
      { type: "waze", location: "Pike Place Market", navigate: false },
      "https://waze.com/ul?q=Pike%20Place%20Market",
    ],
    // Payment links
    [{ type: "cashapp", username: "$Qrdx" }, "https://cash.app/$Qrdx"],
    [
      { type: "cashapp", username: "https://cash.app/$qrdx" },
      "https://cash.app/$qrdx",
    ],
    [{ type: "revolut", username: "@QRdx" }, "https://revolut.me/qrdx"],
    // Crypto
    [
      {
        type: "litecoin",
        address: "ltc1qg82gu5m5c5szdx4rgrqx0ymcx8jvjf0v3qyp5c",
        amount: "0.5",
        label: "Café & Co",
      },
      "litecoin:ltc1qg82gu5m5c5szdx4rgrqx0ymcx8jvjf0v3qyp5c?amount=0.5&label=Caf%C3%A9%20%26%20Co",
    ],
    [
      {
        type: "bitcoincash",
        address: "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
      },
      "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
    ],
    [
      {
        type: "solana",
        address: "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN",
        amount: "1.000000001",
        message: "Thanks",
      },
      "solana:mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN?amount=1.000000001&message=Thanks",
    ],
    [
      {
        type: "monero",
        address:
          "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A",
        amount: "0.25",
        label: "Donation",
        message: "Thanks",
      },
      "monero:44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A?tx_amount=0.25&recipient_name=Donation&tx_description=Thanks",
    ],
  ])("%o → %s", (config, expected) => {
    expect(validateContent(config)).toEqual({ valid: true });
    expect(enc(config)).toBe(expected);
  });
});

describe("checks", () => {
  it.each<[QRContentConfig, RegExp]>([
    [{ type: "telegram", username: "abc" }, /5-32/],
    [{ type: "telegram", username: "1password" }, /starting with a letter/],
    [{ type: "telegram", phoneNumber: "415 555 0132" }, /country code/],
    [{ type: "telegram" }, /required/],
    [{ type: "signal", link: "https://signal.me/" }, /signal\.me/],
    [{ type: "signal", link: "https://example.com/#eu/abc" }, /signal\.me/],
    [{ type: "discord", invite: "https://discord.com/channels/1/2" }, /invite/],
    [{ type: "discord", invite: "has space" }, /invite/],
    [{ type: "line", username: "a b" }, /LINE IDs/],
    [{ type: "bluesky", handle: "bad_handle!" }, /handle/],
    [{ type: "mastodon", handle: "alice" }, /full handle/],
    [{ type: "twitch", username: "abc" }, /4-25/],
    [{ type: "soundcloud", username: "a" }, /3-25/],
    [{ type: "zoom", meeting: "1234" }, /9 to 11 digits/],
    [{ type: "zoom", meeting: "https://zoom.us/pricing" }, /invite link/],
    [{ type: "google-meet", meeting: "abc-defg" }, /abc-defg-hij/],
    [{ type: "cashapp", username: "$12345" }, /at least one letter/],
    [{ type: "revolut", username: "a" }, /Revolut usernames/],
    [
      {
        type: "litecoin",
        address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      },
      /Litecoin/,
    ],
    [
      {
        type: "solana",
        address: "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN",
        amount: "1.0000000001",
      },
      /9 decimals/,
    ],
    [{ type: "monero", address: "4abc" }, /Monero/],
  ])("%o is refused", (config, message) => {
    const result = validateContent(config);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(message);
    expect(enc(config)).toBe("");
  });

  it("puts the problem on the field the form shows", () => {
    expect(
      telegramSchema.safeParse({ username: "abc", phoneNumber: "" }).error
        ?.issues[0]?.path,
    ).toEqual(["username"]);
    expect(
      signalSchema.safeParse({ phoneNumber: "", link: "" }).error?.issues[0]
        ?.path,
    ).toEqual([]);
    expect(
      discordSchema.safeParse({ invite: "x y" }).error?.issues[0]?.path,
    ).toEqual(["invite"]);
  });
});

describe("smart paste", () => {
  it.each([
    ["https://t.me/durov", "telegram"],
    ["https://signal.me/#eu/abc", "signal"],
    ["https://discord.gg/abc123", "discord"],
    ["https://discord.com/invite/abc123", "discord"],
    ["https://line.me/R/ti/p/@shop", "line"],
    ["https://bsky.app/profile/qrdx.dev", "bluesky"],
    ["https://www.twitch.tv/ninja", "twitch"],
    ["https://soundcloud.com/forss/flickermood", "soundcloud"],
    ["https://us02web.zoom.us/j/123456789?pwd=x", "zoom"],
    ["https://meet.google.com/abc-defg-hij", "google-meet"],
    ["https://waze.com/ul?ll=48.8584,2.2945&navigate=yes", "waze"],
    ["https://cash.app/$qrdx", "cashapp"],
    ["https://revolut.me/qrdx", "revolut"],
  ])("%s opens the %s form", (url, type) => {
    const parsed = parseURL(url);
    expect(parsed?.type).toBe(type);
    expect(
      validateContent(parsed?.config as QRContentConfig),
      JSON.stringify(parsed?.config),
    ).toEqual({ valid: true });
  });

  it("keeps other links on these hosts as plain links", () => {
    expect(parseURL("https://discord.com/channels/1/2")?.type).toBe("url");
    expect(parseURL("https://www.twitch.tv/directory/all")?.type).toBe("url");
    expect(parseURL("https://zoom.us/pricing")?.type).toBe("url");
    expect(parseURL("https://bsky.app/")?.type).toBe("url");
  });

  it("reads a Waze link's place back", () => {
    expect(parseURL("https://waze.com/ul?q=Pike%20Place&navigate=yes")).toEqual(
      {
        type: "waze",
        config: { type: "waze", location: "Pike Place", navigate: true },
      },
    );
  });
});
