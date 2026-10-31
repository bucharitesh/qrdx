// Run: cd apps/docs && npx tsx --test components/landing/landing-utils.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkUrlSchema } from "./block-kit";
import { isUntrackedPath } from "./customer-page-paths";
import { openStatus } from "./opening-hours";
import { networkForUrl } from "./social-networks";
import { contrastRatio, paletteFrom, paletteFromQrStyle } from "./theme";
import { parseVideoUrl, videoEmbedUrl } from "./video";

describe("parseVideoUrl", () => {
  it("accepts YouTube, Vimeo and Loom links", () => {
    assert.deepEqual(parseVideoUrl("https://youtu.be/aqz-KE-bpKQ?t=1m5s"), {
      provider: "youtube",
      id: "aqz-KE-bpKQ",
      start: 65,
    });
    assert.equal(
      parseVideoUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ")?.id,
      "aqz-KE-bpKQ",
    );
    assert.equal(
      parseVideoUrl("https://m.youtube.com/shorts/aqz-KE-bpKQ")?.provider,
      "youtube",
    );
    assert.equal(parseVideoUrl("https://vimeo.com/76979871")?.id, "76979871");
    assert.equal(
      parseVideoUrl(
        "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
      )?.provider,
      "loom",
    );
  });

  it("rejects other hosts and malformed ids", () => {
    assert.equal(
      parseVideoUrl("https://evil.example/watch?v=aqz-KE-bpKQ"),
      null,
    );
    assert.equal(
      parseVideoUrl("https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ"),
      null,
    );
    assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=short"), null);
    assert.equal(parseVideoUrl("javascript:alert(1)"), null);
  });

  it("embeds YouTube without cookies", () => {
    const video = parseVideoUrl("https://youtu.be/aqz-KE-bpKQ");
    assert.ok(video);
    assert.ok(
      videoEmbedUrl(video).startsWith(
        "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?",
      ),
    );
  });
});

describe("linkUrlSchema", () => {
  it("allows web, mail, phone and sms links only", () => {
    for (const ok of [
      "https://example.com",
      "mailto:hi@example.com",
      "tel:+15550100",
      "sms:+15550100",
    ]) {
      assert.ok(linkUrlSchema.safeParse(ok).success, ok);
    }
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "example.com",
      "tel:call-me",
      "mailto:nobody",
    ]) {
      assert.equal(linkUrlSchema.safeParse(bad).success, false, bad);
    }
  });
});

describe("openStatus", () => {
  const nineToFive = { ranges: [{ open: "09:00", close: "17:00" }] };
  const week = [
    nineToFive,
    nineToFive,
    nineToFive,
    nineToFive,
    { ranges: [{ open: "18:00", close: "02:00" }] },
    { ranges: [] },
    { ranges: [] },
  ];

  it("is open within a range and reports the closing time", () => {
    // Monday 2026-11-02 10:00 UTC
    assert.deepEqual(
      openStatus(week, "UTC", new Date("2026-11-02T10:00:00Z")),
      {
        open: true,
        closesAt: "17:00",
      },
    );
  });

  it("handles ranges past midnight", () => {
    // Saturday 01:00 belongs to Friday's 18:00–02:00
    assert.equal(
      openStatus(week, "UTC", new Date("2026-11-07T01:00:00Z")).open,
      true,
    );
  });

  it("finds the next opening when closed", () => {
    // Saturday noon → Monday 09:00
    assert.deepEqual(
      openStatus(week, "UTC", new Date("2026-11-07T12:00:00Z")),
      {
        open: false,
        opensAt: { day: 0, time: "09:00" },
      },
    );
  });

  it("uses the given time zone", () => {
    // 08:30 UTC = 09:30 in Berlin (CET, UTC+1)
    assert.equal(
      openStatus(week, "Europe/Berlin", new Date("2026-11-02T08:30:00Z")).open,
      true,
    );
  });
});

describe("theme colors", () => {
  it("derives readable palettes", () => {
    const palette = paletteFrom("#ffffff", "#155dfc");
    assert.ok(contrastRatio(palette.background, palette.foreground) >= 7);
    assert.ok(contrastRatio(palette.primary, palette.primaryForeground) >= 4.5);
  });

  it("maps saved QR themes to page palettes", () => {
    const palette = paletteFromQrStyle({
      bgColor: "#fff8f0",
      fgColor: {
        type: "linear",
        stops: [{ color: "#9a3412" }, { color: "#000000" }],
      },
    });
    assert.equal(palette?.background, "#fff8f0");
    assert.equal(palette?.primary, "#9a3412");
    assert.equal(paletteFromQrStyle({ fgColor: "black" }), null);
  });
});

describe("helpers", () => {
  it("recognizes social networks by host", () => {
    assert.equal(networkForUrl("https://www.instagram.com/x")?.id, "instagram");
    assert.equal(networkForUrl("https://evilinstagram.com/x"), null);
    assert.equal(networkForUrl("mailto:a@b.co")?.id, "email");
  });

  it("detects paths where QRdx tracking must not load", () => {
    for (const path of [
      "/p/abc1234",
      "/q/abc1234/unlock",
      "/ended",
      "/scan",
      "/scan/history",
    ]) {
      assert.ok(isUntrackedPath(path), path);
    }
    for (const path of [
      "/pricing",
      "/playground",
      "/scanner-tips",
      "/",
      "/dashboard/pages",
    ]) {
      assert.equal(isUntrackedPath(path), false, path);
    }
  });
});
