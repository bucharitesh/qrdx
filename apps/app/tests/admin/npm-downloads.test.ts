// npm downloads on /admin/growth: on the day a version is published,
// mirrors and scanners fetch it (2026-11-10: 416 of qrdx's 525 downloads
// that week), so every figure is also given without publish days, taken
// from the registry's `time`. fetch is faked; nothing goes out.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNpmDownloads,
  parseDownloads,
  publishDays,
  summarizeDownloads,
} from "@/app/(app)/admin/_lib/npm-downloads";
import { growthWeeks } from "@/app/(app)/admin/_lib/weeks";

describe("publishDays", () => {
  it("is the UTC days versions were published, not created or modified", () => {
    expect(
      publishDays({
        created: "2026-05-01T08:00:00.000Z",
        modified: "2026-11-12T09:00:00.000Z",
        "0.0.1": "2026-05-01T08:00:00.000Z",
        "0.0.47": "2026-11-10T11:59:22.315Z",
        "0.0.48": "2026-11-10T22:38:18.986Z",
      }),
    ).toEqual(new Set(["2026-05-01", "2026-11-10"]));
  });

  it("is empty for anything else", () => {
    expect(publishDays(undefined)).toEqual(new Set());
    expect(publishDays("2026-11-10")).toEqual(new Set());
    expect(publishDays({ "1.0.0": 12, "1.0.1": "soon" })).toEqual(new Set());
  });
});

describe("parseDownloads", () => {
  it("keeps well-formed days", () => {
    expect(
      parseDownloads([
        { day: "2026-11-10", downloads: 416 },
        { day: "11/11/2026", downloads: 3 },
        { day: "2026-11-12", downloads: -1 },
        { day: "2026-11-13" },
        null,
      ]),
    ).toEqual([{ day: "2026-11-10", downloads: 416 }]);
    expect(parseDownloads({})).toEqual([]);
  });
});

describe("summarizeDownloads", () => {
  const weeks = ["2026-11-02", "2026-11-09"];
  const days = [
    { day: "2026-10-31", downloads: 100 }, // before the weeks
    { day: "2026-11-03", downloads: 10 },
    { day: "2026-11-09", downloads: 20 },
    { day: "2026-11-10", downloads: 416 },
    { day: "2026-11-11", downloads: 30 },
    { day: "2026-11-13", downloads: 0 }, // today: npm has nothing yet
  ];
  const summary = summarizeDownloads(
    days,
    new Set(["2026-11-10"]),
    weeks,
    "2026-11-13",
  );

  it("gives each week with and without its publish days", () => {
    expect(summary.weekly).toEqual([
      {
        week: "2026-11-02",
        downloads: 10,
        withoutPublishDays: 10,
        publishDays: [],
      },
      {
        week: "2026-11-09",
        downloads: 466,
        withoutPublishDays: 50,
        publishDays: ["2026-11-10"],
      },
    ]);
  });

  it("gives the 28 days before today the same way", () => {
    expect(summary.recent).toEqual({
      downloads: 576,
      withoutPublishDays: 160,
      publishDays: ["2026-11-10"],
    });
  });

  it("leaves out days more than 28 days back", () => {
    const old = summarizeDownloads(
      [
        { day: "2026-10-15", downloads: 7 },
        { day: "2026-10-16", downloads: 1 },
      ],
      new Set(),
      weeks,
      "2026-11-13",
    );
    expect(old.recent.downloads).toBe(1);
  });
});

describe("getNpmDownloads", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads each package's range and registry document", async () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const weeks = growthWeeks(now);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("n8n")) return json({ error: "not found" }, 404);
      if (url.startsWith("https://registry.npmjs.org/")) {
        return json({ time: { "1.0.0": "2026-11-10T12:00:00.000Z" } });
      }
      return json({
        downloads: [
          { day: "2026-11-09", downloads: 5 },
          { day: "2026-11-10", downloads: 400 },
        ],
      });
    });

    const result = await getNpmDownloads(weeks, now);
    expect(result.map((pkg) => [pkg.name, pkg.status])).toEqual([
      ["qrdx", "ok"],
      ["@qrdx/cli", "ok"],
      ["@qrdx/n8n-nodes-qrdx", "missing"],
    ]);
    const [qrdx] = result;
    if (qrdx?.status !== "ok") throw new Error("expected qrdx");
    expect(qrdx.recent).toEqual({
      downloads: 405,
      withoutPublishDays: 5,
      publishDays: ["2026-11-10"],
    });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain(
      `https://api.npmjs.org/downloads/range/${weeks[0]}:2026-11-13/@qrdx/cli`,
    );
    expect(urls).toContain("https://registry.npmjs.org/@qrdx%2fcli");
    expect(urls).toContain("https://registry.npmjs.org/qrdx");
  });

  it("reports a failing API per package", async () => {
    const now = new Date("2026-10-01T12:00:00Z");
    fetchMock.mockResolvedValue(json({}, 503));
    const result = await getNpmDownloads(growthWeeks(now), now);
    expect(result.every((pkg) => pkg.status === "error")).toBe(true);
    expect(result[0]).toMatchObject({
      status: "error",
      message: expect.stringContaining("HTTP 503"),
    });
  });
});
