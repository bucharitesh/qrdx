// How a sign-up's visit started (lib/analytics/landing.ts): read on the
// tab's first page, kept in memory only, sanitised in the browser and again
// on the server, and never read at all under Do Not Track or Global Privacy
// Control.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureLanding,
  cleanLanding,
  cleanPath,
  cleanUtm,
  decodeLandingHeader,
  encodeLandingHeader,
  forgetLanding,
  readLanding,
  signUpLanding,
} from "@/lib/analytics/landing";

afterEach(() => {
  forgetLanding();
  vi.unstubAllGlobals();
});

describe("reading a page's address and referrer", () => {
  it("keeps an external referrer's host name only, and the campaign tags", () => {
    expect(
      readLanding({
        href: "https://qrdx.dev/qr-code-generator/wifi?utm_source=Newsletter&utm_medium=Email&utm_campaign=Nov%20Launch&ref=chrome-extension&secret=1#url=https://x.example",
        referrer: "https://www.google.com/search?q=wifi+qr+code",
      }),
    ).toEqual({
      referrer_host: "www.google.com",
      landing_path: "/qr-code-generator/wifi",
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "Nov Launch",
      ref: "chrome-extension",
    });
  });

  it("drops the site's own pages as referrers, and no referrer at all", () => {
    expect(
      readLanding({
        href: "https://qrdx.dev/pricing",
        referrer: "https://qrdx.dev/",
      }),
    ).toEqual({ landing_path: "/pricing" });
    expect(
      readLanding({
        href: "https://qrdx.dev/",
        referrer: "https://mcp.qrdx.dev/mcp",
      }),
    ).toEqual({ landing_path: "/" });
    expect(readLanding({ href: "https://qrdx.dev/", referrer: "" })).toEqual({
      landing_path: "/",
    });
    expect(
      readLanding({ href: "https://qrdx.dev/", referrer: "not a url" }),
    ).toEqual({ landing_path: "/" });
  });

  it("drops campaign tags holding an email, a URL or a phone number", () => {
    expect(
      readLanding({
        href: "https://qrdx.dev/?utm_source=ana%40example.com&utm_medium=https%3A%2F%2Fx.example%2Fa&utm_campaign=%2B44%2020%207946%200000&ref=%3Cscript%3E",
        referrer: "",
      }),
    ).toEqual({ landing_path: "/" });
  });

  it("keeps a bare site name as utm_source (ChatGPT sends chatgpt.com)", () => {
    expect(cleanUtm("chatgpt.com")).toBe("chatgpt.com");
    expect(cleanUtm("https://chatgpt.com/c/123")).toBeNull();
    expect(cleanUtm("a".repeat(65))).toBeNull();
  });
});

describe("page paths", () => {
  it("never carry a query, a fragment, an invite or a workspace's address", () => {
    expect(cleanPath("/playground?url=https://x.example#style=abc")).toBe(
      "/playground",
    );
    expect(cleanPath("/invite/inv_secret123")).toBe("/invite");
    expect(cleanPath("/dashboard/ana-diaz/codes/abc")).toBe("/dashboard");
    expect(cleanPath("/settings/account")).toBe("/settings");
    expect(cleanPath("/es/qr-code-generator")).toBe("/es/qr-code-generator");
  });

  it("are at most 120 printable characters, starting with a slash", () => {
    expect(cleanPath(`/${"a".repeat(300)}`)).toHaveLength(120);
    expect(cleanPath("relative")).toBeNull();
    expect(cleanPath("/ünïcode")).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });
});

describe("the server's second cleaning", () => {
  it("keeps only known fields with good values", () => {
    expect(
      cleanLanding(
        {
          referrer_host: "News.YCombinator.com",
          landing_path: "/blog/x?y=1",
          signup_path: "/playground",
          utm_source: "x".repeat(70),
          ref: "MCP",
          channel: "affiliate",
          email: "ana@example.com",
        },
        "qrdx.dev",
      ),
    ).toEqual({
      referrer_host: "news.ycombinator.com",
      landing_path: "/blog/x",
      signup_path: "/playground",
      ref: "mcp",
    });
    expect(cleanLanding({ referrer_host: "qrdx.dev" }, "qrdx.dev")).toEqual({});
    expect(cleanLanding({ referrer_host: "http://evil" })).toEqual({});
    expect(cleanLanding("landing")).toBeNull();
    expect(cleanLanding(["a"])).toBeNull();
    expect(cleanLanding(null)).toBeNull();
  });

  it("reads the header back, and refuses one that isn't ours", () => {
    const landing = {
      referrer_host: "github.com",
      landing_path: "/docs",
      utm_campaign: "Lanzamiento ñ",
    };
    const header = encodeLandingHeader(landing);
    // Plain ASCII, so the browser can send it as a header.
    expect(header).toMatch(/^[\x21-\x7e]+$/);
    expect(decodeLandingHeader(header)).toEqual(landing);
    expect(decodeLandingHeader("%7Bnot json")).toBeNull();
    expect(decodeLandingHeader("x".repeat(3000))).toBeNull();
    expect(decodeLandingHeader(null)).toBeNull();
  });
});

describe("this tab's visit", () => {
  function stubBrowser(options: {
    href: string;
    referrer: string;
    dnt?: string;
    gpc?: boolean;
  }) {
    const writes: string[] = [];
    const storage = () => ({
      getItem: () => null,
      setItem: (key: string) => writes.push(`storage:${key}`),
      removeItem: () => {},
    });
    const document = { referrer: options.referrer };
    Object.defineProperty(document, "cookie", {
      get: () => "",
      set: (value: string) => writes.push(`cookie:${value}`),
    });
    const url = new URL(options.href);
    const location = {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
    };
    vi.stubGlobal("document", document);
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
    vi.stubGlobal("navigator", {
      doNotTrack: options.dnt ?? null,
      globalPrivacyControl: options.gpc ?? false,
    });
    vi.stubGlobal("window", {
      location,
      localStorage: storage(),
      sessionStorage: storage(),
    });
    return { writes, location };
  }

  it("keeps the first page in memory and adds where the sign-up happened", () => {
    const { writes, location } = stubBrowser({
      href: "https://qrdx.dev/qr-code-generator?utm_source=reddit",
      referrer: "https://www.reddit.com/r/qrcodes",
    });
    captureLanding();
    // Later pages of the visit change nothing.
    location.href = "https://qrdx.dev/playground?utm_source=other";
    location.pathname = "/playground";
    captureLanding();
    expect(signUpLanding()).toEqual({
      referrer_host: "www.reddit.com",
      landing_path: "/qr-code-generator",
      utm_source: "reddit",
      signup_path: "/playground",
    });
    expect(writes).toEqual([]);
    // A reload starts over: nothing was stored to bring it back, and the
    // reloaded page's referrer is the site itself.
    forgetLanding();
    (globalThis.document as { referrer: string }).referrer =
      "https://qrdx.dev/qr-code-generator";
    expect(signUpLanding()).toEqual({
      landing_path: "/playground",
      utm_source: "other",
      signup_path: "/playground",
    });
  });

  it("reads nothing under Do Not Track or Global Privacy Control", () => {
    stubBrowser({
      href: "https://qrdx.dev/?utm_source=x",
      referrer: "https://github.com/",
      dnt: "1",
    });
    captureLanding();
    expect(signUpLanding()).toBeNull();
    forgetLanding();
    stubBrowser({
      href: "https://qrdx.dev/",
      referrer: "https://github.com/",
      gpc: true,
    });
    expect(signUpLanding()).toBeNull();
  });
});
