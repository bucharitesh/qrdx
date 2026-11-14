// Smart paste picks a content type from what is pasted, and the forms accept
// a platform address only on that platform. Both go by the URL's own
// hostname: a platform domain in the path or query ("evil.example/?x.com/a"),
// in front of another domain ("youtube.com.evil.example"), as userinfo
// ("facebook.com@evil.example") or as the tail of a longer name
// ("example-box.com" ends in "x.com") no longer counts.
import { describe, expect, it } from "vitest";
import {
  amazonSchema,
  attendanceSchema,
  calcomSchema,
  flipkartSchema,
  googleDriveSchema,
  spotifySchema,
} from "@/lib/validations/qr-content";
import { isOnDomain, parseWebUrl } from "@/utils/url-host";
import { parseURL } from "@/utils/url-parser";

describe("parseWebUrl and isOnDomain", () => {
  it.each([
    ["https://www.youtube.com/watch?v=1", "youtube.com", true],
    ["youtube.com/@qrdx", "youtube.com", true],
    ["https://m.youtube.com/", "youtube.com", true],
    ["https://youtube.com./watch", "youtube.com", true],
    ["https://evil.example/?youtube.com", "youtube.com", false],
    ["https://youtube.com.evil.example/", "youtube.com", false],
    ["https://notyoutube.com/", "youtube.com", false],
    ["https://youtube.com@evil.example/", "youtube.com", false],
    ["https://example-box.com/s/abc", "x.com", false],
    ["javascript://youtube.com/%0aalert(1)", "youtube.com", false],
    ["mailto:me@youtube.com", "youtube.com", false],
    ["not a url at all", "youtube.com", false],
    ["", "youtube.com", false],
  ])("%s on %s → %s", (value, domain, expected) => {
    expect(isOnDomain(parseWebUrl(value), domain)).toBe(expected);
  });
});

// Real addresses, with what smart paste made of them before the change.
const REAL: [string, ReturnType<typeof parseURL>][] = [
  [
    "https://www.instagram.com/qrdx/",
    { type: "instagram", config: { type: "instagram", username: "qrdx" } },
  ],
  [
    "instagram.com/qrdx",
    { type: "instagram", config: { type: "instagram", username: "qrdx" } },
  ],
  [
    "https://instagr.am/qrdx",
    { type: "instagram", config: { type: "instagram", username: "qrdx" } },
  ],
  [
    "https://m.facebook.com/profile.php?id=123",
    {
      type: "facebook",
      config: {
        type: "facebook",
        profileUrl: "https://m.facebook.com/profile.php?id=123",
      },
    },
  ],
  [
    "https://fb.com/qrdx",
    {
      type: "facebook",
      config: { type: "facebook", profileUrl: "https://fb.com/qrdx" },
    },
  ],
  [
    "https://www.x.com/qrdx?s=20",
    { type: "twitter", config: { type: "twitter", username: "qrdx" } },
  ],
  [
    "https://mobile.twitter.com/qrdx",
    { type: "twitter", config: { type: "twitter", username: "qrdx" } },
  ],
  [
    "@qrdx",
    { type: "twitter", config: { type: "twitter", username: "@qrdx" } },
  ],
  [
    "https://in.linkedin.com/in/qrdx",
    {
      type: "linkedin",
      config: {
        type: "linkedin",
        profileUrl: "https://in.linkedin.com/in/qrdx",
      },
    },
  ],
  [
    "https://www.tiktok.com/@qrdx/video/123",
    { type: "tiktok", config: { type: "tiktok", username: "@qrdx" } },
  ],
  [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    {
      type: "youtube",
      config: {
        type: "youtube",
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        channelUrl: "",
      },
    },
  ],
  [
    "https://youtu.be/dQw4w9WgXcQ?t=42",
    {
      type: "youtube",
      config: {
        type: "youtube",
        videoUrl: "https://youtu.be/dQw4w9WgXcQ?t=42",
        channelUrl: "",
      },
    },
  ],
  [
    "https://www.youtube.com/shorts/abc",
    {
      type: "youtube",
      config: {
        type: "youtube",
        videoUrl: "https://www.youtube.com/shorts/abc",
        channelUrl: "",
      },
    },
  ],
  [
    "https://www.youtube.com/@qrdx",
    {
      type: "youtube",
      config: {
        type: "youtube",
        channelUrl: "https://www.youtube.com/@qrdx",
        videoUrl: "",
      },
    },
  ],
  [
    "https://old.reddit.com/u/qrdx",
    {
      type: "reddit",
      config: { type: "reddit", username: "qrdx", subreddit: "" },
    },
  ],
  [
    "https://www.reddit.com/r/qrdx/",
    {
      type: "reddit",
      config: { type: "reddit", subreddit: "qrdx", username: "" },
    },
  ],
  [
    "https://www.pinterest.com/qrdx/",
    { type: "pinterest", config: { type: "pinterest", username: "qrdx" } },
  ],
  [
    "https://snapchat.com/add/qrdx?share_id=1",
    { type: "snapchat", config: { type: "snapchat", username: "qrdx" } },
  ],
  [
    "threads.net/@qrdx",
    { type: "threads", config: { type: "threads", username: "@qrdx" } },
  ],
  [
    "https://open.spotify.com/track/abc",
    {
      type: "spotify",
      config: { type: "spotify", uri: "https://open.spotify.com/track/abc" },
    },
  ],
  [
    "spotify:track:abc",
    { type: "spotify", config: { type: "spotify", uri: "spotify:track:abc" } },
  ],
  [
    "https://venmo.com/qrdx",
    {
      type: "venmo",
      config: { type: "venmo", username: "qrdx", amount: "", note: "" },
    },
  ],
  [
    "https://www.paypal.me/qrdx/5",
    {
      type: "paypal",
      config: { type: "paypal", paypalUrl: "https://www.paypal.me/qrdx/5" },
    },
  ],
  ...[
    "https://www.amazon.com/dp/B0123",
    "https://smile.amazon.com/dp/B0",
    "https://www.amazon.co.uk/dp/B0",
    "https://www.amazon.com.au/dp/x",
    "https://www.amazon.in/dp/B0",
    "https://www.amazon.de/dp/x",
    "amazon.de/dp/x",
  ].map((url): [string, ReturnType<typeof parseURL>] => [
    url,
    { type: "amazon", config: { type: "amazon", productUrl: url } },
  ]),
  [
    "https://dl.flipkart.com/s/abc",
    {
      type: "flipkart",
      config: { type: "flipkart", productUrl: "https://dl.flipkart.com/s/abc" },
    },
  ],
  [
    "https://qrdx.etsy.com",
    {
      type: "etsy",
      config: { type: "etsy", shopUrl: "https://qrdx.etsy.com" },
    },
  ],
  [
    "https://cal.com/qrdx/30min",
    {
      type: "calcom",
      config: { type: "calcom", bookingUrl: "https://cal.com/qrdx/30min" },
    },
  ],
  [
    "https://dub.sh/abc",
    {
      type: "dubsh",
      config: { type: "dubsh", shortUrl: "https://dub.sh/abc" },
    },
  ],
  [
    "https://docs.google.com/forms/d/e/1FAIpQ/viewform",
    {
      type: "attendance",
      config: {
        type: "attendance",
        formUrl: "https://docs.google.com/forms/d/e/1FAIpQ/viewform",
      },
    },
  ],
  [
    "https://forms.gle/abc123",
    {
      type: "attendance",
      config: { type: "attendance", formUrl: "https://forms.gle/abc123" },
    },
  ],
  [
    "https://drive.google.com/file/d/abc/view",
    {
      type: "google-drive",
      config: {
        type: "google-drive",
        url: "https://drive.google.com/file/d/abc/view",
        source: "manual",
      },
    },
  ],
  [
    "https://docs.google.com/spreadsheets/d/abc/edit#gid=0",
    {
      type: "google-drive",
      config: {
        type: "google-drive",
        url: "https://docs.google.com/spreadsheets/d/abc/edit#gid=0",
        source: "manual",
      },
    },
  ],
  [
    "https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z",
    {
      type: "maps",
      config: { type: "maps", location: "48.8583701,2.2944813" },
    },
  ],
  [
    "https://maps.google.com/?q=Eiffel%20Tower",
    { type: "maps", config: { type: "maps", location: "Eiffel Tower" } },
  ],
  [
    "https://goo.gl/maps/abc",
    {
      type: "maps",
      config: { type: "maps", location: "https://goo.gl/maps/abc" },
    },
  ],
  [
    "https://wa.me/15551234567?text=Hello%20there",
    {
      type: "whatsapp",
      config: {
        type: "whatsapp",
        phoneNumber: "+15551234567",
        message: "Hello there",
      },
    },
  ],
  [
    "wa.me/15551234567",
    {
      type: "whatsapp",
      config: { type: "whatsapp", phoneNumber: "+15551234567", message: "" },
    },
  ],
  [
    "https://qrdx.dev/pricing?x=1",
    {
      type: "url",
      config: { type: "url", url: "https://qrdx.dev/pricing?x=1" },
    },
  ],
];

// Each of these was taken for the platform named in it before the change.
const SPOOFS = [
  "https://evil.example/?instagram.com/qrdx",
  "https://evil.example/facebook.com",
  "https://facebook.com@evil.example/",
  "https://example-box.com/s/abc",
  "https://evil.example/?x.com/qrdx",
  "https://linkedin.com.evil.example/in/x",
  "https://evil.example/tiktok.com/@x",
  "https://evil.example/watch?v=youtube.com",
  "https://youtube.com.evil.example/watch?v=1",
  "https://evil.example/youtu.be/abc",
  "https://evil.example/reddit.com/r/x",
  "https://evil.example/pinterest.com/x",
  "https://evil.example/snapchat.com/add/x",
  "https://evil.example/threads.net/@x",
  "https://evil.example/spotify.com",
  "https://evil.example/venmo.com/x",
  "https://evil.example/paypal.me/x",
  "https://amazon.evil.example/dp/x",
  "https://evil.example/amazon.com/dp/x",
  "https://evil.example/flipkart.com",
  "https://evil.example/etsy.com",
  "https://example-medical.com/book",
  "https://evil.example/dub.sh/x",
  "https://evil.example/docs.google.com/forms/x",
  "https://evil.example/forms.gle/x",
  "https://evil.example/drive.google.com/file",
  "https://evil.example/?docs.google.com/document/d/x",
  "https://evil.example/google.com/maps",
  "https://evil.example/maps.google.com",
  "https://evil.example/wa.me/155",
];

describe("parseURL", () => {
  it.each(REAL)("detects %s as before", (url, expected) => {
    expect(parseURL(url)).toEqual(expected);
  });

  it.each(SPOOFS)("keeps %s a plain link", (url) => {
    expect(parseURL(url)).toEqual({
      type: "url",
      config: { type: "url", url },
    });
  });

  it("reads a mailto: address on a platform domain as an email", () => {
    expect(parseURL("mailto:me@facebook.com")?.type).toBe("email");
  });
});

describe("form schemas", () => {
  const accepts = (
    schema: { safeParse: (value: unknown) => { success: boolean } },
    field: string,
    value: string,
  ) => schema.safeParse({ [field]: value }).success;

  it.each([
    ["https://drive.google.com/file/d/abc/view", true],
    ["https://docs.google.com/document/d/abc/edit", true],
    ["https://docs.google.com/presentation/d/abc", true],
    ["https://evil.example/drive.google.com/file", false],
    ["https://evil.example/?docs.google.com/document/d/x", false],
    ["https://drive.google.com.evil.example/file/d/x", false],
  ])("Google Drive: %s → %s", (url, ok) => {
    expect(accepts(googleDriveSchema, "url", url)).toBe(ok);
  });

  it.each([
    ["https://docs.google.com/forms/d/e/1FAIpQ/viewform", true],
    ["https://forms.gle/abc123", true],
    ["https://evil.example/docs.google.com/forms/x", false],
    ["https://evil.example/forms.gle/x", false],
    ["https://notgoogle.com/forms/x", false],
  ])("Google Forms: %s → %s", (url, ok) => {
    expect(accepts(attendanceSchema, "formUrl", url)).toBe(ok);
  });

  it.each([
    ["https://www.amazon.com/dp/B0123", true],
    ["https://www.amazon.co.uk/dp/B0", true],
    ["https://www.amazon.com.br/dp/x", true],
    ["https://www.amazon.co.jp/dp/x", true],
    ["https://www.amazon.ae/dp/x", true],
    ["https://amazon.evil.example/dp/x", false],
    ["https://evil.example/amazon.com/dp/x", false],
    ["https://evil-amazon.com/dp/x", false],
  ])("Amazon: %s → %s", (url, ok) => {
    expect(accepts(amazonSchema, "productUrl", url)).toBe(ok);
  });

  it.each([
    ["https://www.flipkart.com/item/p/itm123", true],
    ["https://dl.flipkart.com/s/abc", true],
    ["https://evil.example/flipkart.com", false],
    ["https://flipkart.com.evil.example/", false],
  ])("Flipkart: %s → %s", (url, ok) => {
    expect(accepts(flipkartSchema, "productUrl", url)).toBe(ok);
  });

  it.each([
    ["https://cal.com/qrdx", true],
    ["https://app.cal.com/qrdx/30min", true],
    ["https://example-medical.com/book", false],
    ["https://evil.example/cal.com/qrdx", false],
  ])("Cal.com: %s → %s", (url, ok) => {
    expect(accepts(calcomSchema, "bookingUrl", url)).toBe(ok);
  });

  // Any https address is a valid Spotify value (share links redirect); the
  // host check only matters for http and scheme-less input.
  it.each([
    ["spotify:track:abc", true],
    ["https://open.spotify.com/track/abc", true],
    ["http://open.spotify.com/track/abc", true],
    ["open.spotify.com/album/x", true],
    ["http://evil.example/?spotify.com", false],
    ["evil.example/spotify.com", false],
  ])("Spotify: %s → %s", (uri, ok) => {
    expect(accepts(spotifySchema, "uri", uri)).toBe(ok);
  });
});
