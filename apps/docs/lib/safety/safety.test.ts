// Offline URL heuristics and the Web Risk client against a mocked fetch (no
// network, no database). lib/env validates on import, hence the dummy values:
//   cd apps/docs && DATABASE_URL=postgres://test@127.0.0.1:1/test \
//     npx tsx --conditions=react-server --test lib/safety/safety.test.ts
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { domainToASCII, domainToUnicode } from "node:url";

// Never use a real key (or Google) from tests.
process.env.WEB_RISK_API_KEY = "test-key";

interface Call {
  url: URL;
  apiKey: string | null;
}
let calls: Call[] = [];
let respond: (url: URL) => Response | Promise<Response> = () =>
  Response.json({});

globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = new URL(String(input));
  calls.push({
    url,
    apiKey: new Headers(init?.headers).get("x-goog-api-key"),
  });
  return respond(url);
}) as typeof fetch;

// Imported after the mocks and env are in place.
let heuristics: typeof import("./url-heuristics");
let webRisk: typeof import("./web-risk");
let check: typeof import("./check");
before(async () => {
  heuristics = await import("./url-heuristics");
  webRisk = await import("./web-risk");
  check = await import("./check");
});
const analyzeUrl = (url: string) => heuristics.analyzeUrl(url);
const decodePunycode = (label: string) => heuristics.decodePunycode(label);
const isHomoglyphLabel = (label: string) => heuristics.isHomoglyphLabel(label);
const isShortenerHost = (host: string) => heuristics.isShortenerHost(host);
const lookupWebRisk = (url: string) => webRisk.lookupWebRisk(url);
const clearWebRiskCache = () => webRisk.clearWebRiskCache();
const checkUrlSafety = (url: string) => check.checkUrlSafety(url);

describe("decodePunycode", () => {
  it("matches Node's IDNA decoding", () => {
    for (const name of [
      "аррӏе.com",
      "münchen.de",
      "例子.测试",
      "раураl.com",
      "bücher-ünd-mehr.example",
    ]) {
      const ascii = domainToASCII(name);
      const decoded = ascii
        .split(".")
        .map((label) =>
          label.startsWith("xn--") ? decodePunycode(label.slice(4)) : label,
        )
        .join(".");
      assert.equal(decoded, domainToUnicode(ascii), name);
    }
  });

  it("rejects malformed input", () => {
    assert.equal(decodePunycode("99999999999"), null);
  });
});

describe("homoglyphs", () => {
  it("flags Latin mixed with Cyrillic or Greek, and all-lookalike labels", () => {
    assert.equal(isHomoglyphLabel("раураl"), true); // Cyrillic + Latin l
    assert.equal(isHomoglyphLabel("аррӏе"), true); // all Cyrillic lookalikes
    assert.equal(isHomoglyphLabel("gοοgle"), true); // Greek omicrons
    assert.equal(isHomoglyphLabel("ɡoogle"), true); // Latin script g
  });

  it("leaves ordinary IDNs alone", () => {
    assert.equal(isHomoglyphLabel("münchen"), false);
    assert.equal(isHomoglyphLabel("例子"), false);
    assert.equal(isHomoglyphLabel("яндекс"), false);
    assert.equal(isHomoglyphLabel("example"), false);
  });

  it("checks decoded hostnames", () => {
    assert.deepEqual(analyzeUrl("https://аррӏе.com/login").signals, [
      "homoglyph",
    ]);
    assert.deepEqual(analyzeUrl("https://münchen.de/").signals, []);
    // A whole Cyrillic word under a Cyrillic TLD is normal text.
    assert.deepEqual(analyzeUrl("https://рука.рф/").signals, []);
  });
});

describe("analyzeUrl", () => {
  it("blocks dangerous schemes and invalid input", () => {
    assert.equal(analyzeUrl("javascript:alert(1)").severity, "block");
    assert.equal(analyzeUrl("data:text/html,<b>x</b>").severity, "block");
    assert.equal(analyzeUrl("not a url").severity, "block");
    assert.deepEqual(analyzeUrl("mailto:a@b.co").signals, ["non-http"]);
  });

  it("warns about IP hosts, private networks and credentials", () => {
    assert.deepEqual(analyzeUrl("http://93.184.216.34/").signals, [
      "ip-address",
    ]);
    // Numeric forms are normalized by the URL parser.
    assert.deepEqual(analyzeUrl("http://2130706433/").signals, [
      "ip-address",
      "private-network",
    ]);
    assert.deepEqual(analyzeUrl("http://[::1]/").signals, [
      "ip-address",
      "private-network",
    ]);
    assert.deepEqual(analyzeUrl("http://[::ffff:192.168.0.1]/").signals, [
      "ip-address",
      "private-network",
    ]);
    assert.deepEqual(analyzeUrl("http://[2606:4700::1111]/").signals, [
      "ip-address",
    ]);
    assert.deepEqual(analyzeUrl("http://printer.local/").signals, [
      "private-network",
    ]);
    assert.deepEqual(analyzeUrl("https://user:pw@example.com/").signals, [
      "credentials",
    ]);
  });

  it("warns about shorteners", () => {
    assert.equal(isShortenerHost("www.bit.ly"), true);
    assert.equal(isShortenerHost("notbit.ly"), false);
    const analysis = analyzeUrl("https://bit.ly/3abc");
    assert.deepEqual(analysis.signals, ["shortener"]);
    assert.equal(analysis.severity, "warn");
  });

  it("passes ordinary links", () => {
    const analysis = analyzeUrl("https://www.example.com/menu?table=4");
    assert.equal(analysis.severity, "ok");
    assert.equal(analysis.displayHostname, "www.example.com");
  });
});

describe("lookupWebRisk", () => {
  beforeEach(() => {
    calls = [];
    respond = () => Response.json({});
    clearWebRiskCache();
  });

  it("sends the key in a header, never in the URL", async () => {
    assert.deepEqual(await lookupWebRisk("https://example.com/a#frag"), {
      status: "safe",
    });
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call?.apiKey, "test-key");
    assert.equal(call?.url.searchParams.get("key"), null);
    assert.equal(call?.url.searchParams.get("uri"), "https://example.com/a");
    assert.deepEqual(call?.url.searchParams.getAll("threatTypes"), [
      "MALWARE",
      "SOCIAL_ENGINEERING",
      "UNWANTED_SOFTWARE",
    ]);
  });

  it("reports threats and caches results", async () => {
    respond = () =>
      Response.json({
        threat: {
          threatTypes: ["SOCIAL_ENGINEERING", "SOMETHING_NEW"],
          expireTime: new Date(Date.now() + 600_000).toISOString(),
        },
      });
    const first = await lookupWebRisk("https://evil.example/");
    const second = await lookupWebRisk("https://evil.example/");
    assert.deepEqual(first, {
      status: "threat",
      threats: ["SOCIAL_ENGINEERING"],
    });
    assert.deepEqual(second, first);
    assert.equal(calls.length, 1);
  });

  it("deduplicates concurrent lookups", async () => {
    await Promise.all([
      lookupWebRisk("https://same.example/"),
      lookupWebRisk("https://same.example/"),
    ]);
    assert.equal(calls.length, 1);
  });

  it("fails open on errors", async () => {
    respond = () => new Response("quota", { status: 429 });
    assert.deepEqual(await lookupWebRisk("https://example.org/"), {
      status: "unknown",
      reason: "error",
    });
    respond = () => {
      throw new TypeError("fetch failed");
    };
    clearWebRiskCache();
    assert.deepEqual(await lookupWebRisk("https://example.org/"), {
      status: "unknown",
      reason: "error",
    });
  });

  it("skips lookups for a minute after an outage", async () => {
    respond = () => new Response("down", { status: 503 });
    await lookupWebRisk("https://one.example/");
    respond = () => Response.json({});
    assert.deepEqual(await lookupWebRisk("https://two.example/"), {
      status: "unknown",
      reason: "error",
    });
    assert.equal(calls.length, 1);
  });

  it("skips non-web URLs", async () => {
    assert.deepEqual(await lookupWebRisk("javascript:alert(1)"), {
      status: "unknown",
      reason: "unsupported",
    });
    assert.equal(calls.length, 0);
  });
});

describe("checkUrlSafety", () => {
  beforeEach(() => {
    calls = [];
    clearWebRiskCache();
  });

  it("blocks Web Risk threats", async () => {
    respond = () => Response.json({ threat: { threatTypes: ["MALWARE"] } });
    const safety = await checkUrlSafety("https://bad.example/");
    assert.equal(safety.verdict, "block");
    assert.deepEqual(safety.threats, ["MALWARE"]);
  });

  it("sends heuristic warnings to review", async () => {
    respond = () => Response.json({});
    const safety = await checkUrlSafety("https://tinyurl.com/abc");
    assert.equal(safety.verdict, "review");
    assert.equal(safety.webRisk, "safe");
  });

  it("blocks dangerous schemes without a lookup", async () => {
    const safety = await checkUrlSafety("javascript:alert(1)");
    assert.equal(safety.verdict, "block");
    assert.equal(calls.length, 0);
  });
});
