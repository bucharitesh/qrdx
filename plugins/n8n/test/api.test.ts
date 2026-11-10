import { describe, expect, it } from "vitest";
import {
  type ApiRequest,
  apiErrorDetails,
  codeCreateBody,
  codePath,
  codeUpdateBody,
  collectCodes,
  collectScans,
  normalizeBaseUrl,
  parseStyle,
} from "../nodes/Qrdx/api";

/** A requester that records requests and answers from `respond`. */
function fakeRequester(respond: (request: ApiRequest) => unknown) {
  const requests: ApiRequest[] = [];
  const request = (req: ApiRequest) => {
    requests.push(req);
    return Promise.resolve(respond(req));
  };
  return { request, requests };
}

const code = (n: number) => ({ id: `code${n}`, slug: `s${n}` });

describe("normalizeBaseUrl", () => {
  it("defaults to the hosted API and drops trailing slashes", () => {
    expect(normalizeBaseUrl(undefined)).toBe("https://api.qrdx.dev/v1");
    expect(normalizeBaseUrl("  ")).toBe("https://api.qrdx.dev/v1");
    expect(normalizeBaseUrl("https://qr.example.com/api/v1//")).toBe(
      "https://qr.example.com/api/v1"
    );
  });

  it("refuses values that aren't http(s) URLs", () => {
    expect(() => normalizeBaseUrl("api.qrdx.dev")).toThrow(/isn't a URL/);
    expect(() => normalizeBaseUrl("ftp://api.qrdx.dev")).toThrow(/https:\/\//);
  });
});

describe("apiErrorDetails", () => {
  it("uses QRdx's message and lists details, code and docs", () => {
    const details = apiErrorDetails(400, {
      code: "VALIDATION_ERROR",
      message: "Invalid request body",
      status: 400,
      docs: "https://qrdx.dev/docs/developers/errors",
      data: {
        details: [
          {
            path: "destinationUrl",
            message: "Enter a full URL, starting with https://",
          },
          { param: "data", message: "Required" },
        ],
      },
    });
    expect(details.message).toBe("Invalid request body");
    expect(details.description).toBe(
      [
        "destinationUrl: Enter a full URL, starting with https://",
        "data: Required",
        "Error code: VALIDATION_ERROR",
        "More: https://qrdx.dev/docs/developers/errors",
      ].join("\n")
    );
  });

  it("falls back to the status for bodies that aren't QRdx errors", () => {
    expect(apiErrorDetails(502, "<html>Bad gateway</html>")).toEqual({
      message: "QRdx answered with HTTP 502",
      description: "",
    });
  });
});

describe("collectCodes", () => {
  it("pages with limit and offset until pagination.total", async () => {
    const all = Array.from({ length: 230 }, (_, i) => code(i));
    const { request, requests } = fakeRequester((req) => {
      const limit = Number(req.qs?.limit);
      const offset = Number(req.qs?.offset);
      return {
        data: all.slice(offset, offset + limit),
        pagination: { total: all.length, limit, offset },
      };
    });
    const codes = await collectCodes(
      request,
      { returnAll: true, limit: 0 },
      { status: "all", search: "menu" }
    );
    expect(codes).toHaveLength(230);
    expect(requests.map((r) => r.qs)).toEqual([
      { limit: 100, offset: 0, status: "all", q: "menu" },
      { limit: 100, offset: 100, status: "all", q: "menu" },
      { limit: 100, offset: 200, status: "all", q: "menu" },
    ]);
    expect(
      requests.every((r) => r.method === "GET" && r.path === "/codes")
    ).toBe(true);
  });

  it("asks only for what the limit needs", async () => {
    const all = Array.from({ length: 300 }, (_, i) => code(i));
    const { request, requests } = fakeRequester((req) => {
      const limit = Number(req.qs?.limit);
      const offset = Number(req.qs?.offset);
      return {
        data: all.slice(offset, offset + limit),
        pagination: { total: all.length },
      };
    });
    const codes = await collectCodes(request, { returnAll: false, limit: 130 });
    expect(codes.map((c) => c.id)).toEqual(all.slice(0, 130).map((c) => c.id));
    expect(requests.map((r) => r.qs?.limit)).toEqual([100, 30]);
  });

  it("stops on a short page even without a total", async () => {
    const { request, requests } = fakeRequester(() => ({
      data: [code(1), code(2)],
    }));
    expect(
      await collectCodes(request, { returnAll: true, limit: 0 })
    ).toHaveLength(2);
    expect(requests).toHaveLength(1);
  });
});

describe("collectScans", () => {
  /** The scans endpoint: newest first, `nextBefore` only on a full page. */
  function scansApi(total: number) {
    const all = Array.from({ length: total }, (_, i) => ({
      scannedAt: new Date(
        Date.UTC(2026, 0, 1) + (total - i) * 1000
      ).toISOString(),
      country: "DE",
    }));
    return fakeRequester((req) => {
      const limit = Number(req.qs?.limit);
      const before = req.qs?.before as string | undefined;
      const events = all
        .filter((scan) => !before || scan.scannedAt < before)
        .slice(0, limit);
      return {
        data: {
          codeId: "code1",
          events,
          nextBefore:
            events.length === limit ? (events.at(-1)?.scannedAt ?? null) : null,
        },
      };
    });
  }

  it("follows nextBefore and adds the code id to each scan", async () => {
    const { request, requests } = scansApi(1200);
    const scans = await collectScans(
      request,
      "code1",
      { returnAll: false, limit: 600 },
      { range: "7d" }
    );
    expect(scans).toHaveLength(600);
    expect(scans[0]).toEqual({
      codeId: "code1",
      scannedAt: "2026-01-01T00:20:00.000Z",
      country: "DE",
    });
    expect(new Set(scans.map((scan) => scan.scannedAt)).size).toBe(600);
    expect(requests.map((r) => [r.path, r.qs])).toEqual([
      ["/codes/code1/scans", { limit: 500, range: "7d" }],
      [
        "/codes/code1/scans",
        { limit: 100, range: "7d", before: scans[499]?.scannedAt },
      ],
    ]);
  });

  it("returns every scan with Return All", async () => {
    const { request, requests } = scansApi(1200);
    const scans = await collectScans(request, "code1", {
      returnAll: true,
      limit: 0,
    });
    expect(scans).toHaveLength(1200);
    expect(requests.map((r) => r.qs?.limit)).toEqual([500, 500, 500]);
  });

  it("asks for pages of 500 when returning all", async () => {
    const { request, requests } = fakeRequester(() => ({
      data: { codeId: "c", events: [], nextBefore: null },
    }));
    await collectScans(request, "c", { returnAll: true, limit: 0 });
    expect(requests[0]?.qs).toEqual({ limit: 500 });
  });

  it("escapes the code id in the path", () => {
    expect(codePath("a/b c", "/scans")).toBe("/codes/a%2Fb%20c/scans");
  });
});

describe("code bodies", () => {
  it("creates with only the fields that were set", () => {
    expect(codeCreateBody(" https://example.com/menu ")).toEqual({
      destinationUrl: "https://example.com/menu",
    });
    expect(
      codeCreateBody("https://example.com/menu", {
        title: "Spring menu",
        slug: "spring-menu",
        domainId: "",
        style: '{"fgColor":"#111827","bodyPattern":"circle"}',
      })
    ).toEqual({
      destinationUrl: "https://example.com/menu",
      title: "Spring menu",
      slug: "spring-menu",
      style: { fgColor: "#111827", bodyPattern: "circle" },
    });
    // The field's default, {}, sends no style.
    expect(codeCreateBody("https://example.com", { style: "{}" })).toEqual({
      destinationUrl: "https://example.com",
    });
    expect(() => codeCreateBody("  ")).toThrow(/destination URL/);
  });

  it("updates: empty title clears it, empty domain resets it", () => {
    expect(codeUpdateBody({ title: "", domainId: "", archived: true })).toEqual(
      { title: null, domainId: null, archived: true }
    );
    expect(
      codeUpdateBody({ destinationUrl: "https://example.com/summer" })
    ).toEqual({ destinationUrl: "https://example.com/summer" });
    expect(() => codeUpdateBody({})).toThrow(/at least one field/);
    expect(() => codeUpdateBody({ slug: " " })).toThrow(/back-half/);
  });

  it("parses the style JSON and refuses anything but an object", () => {
    expect(parseStyle("{}")).toEqual({});
    expect(parseStyle({ fgColor: "#000000" })).toEqual({ fgColor: "#000000" });
    expect(parseStyle("")).toBeUndefined();
    expect(() => parseStyle("{nope")).toThrow(/must be JSON/);
    expect(() => parseStyle("[1, 2]")).toThrow(/JSON object/);
  });
});
