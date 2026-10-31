// Redirect URIs of self-serve OAuth apps (lib/oauth-apps/validation.ts):
// registration accepts https:// (http:// only on localhost) without
// wildcards, fragments, credentials or script schemes, and authorization
// requires an exact, character-for-character match.
import { describe, expect, it } from "vitest";
import {
  checkOptionalUrl,
  checkRedirectUri,
  checkRedirectUris,
  isAllowedRedirectUri,
  MAX_REDIRECT_URIS,
  oauthAppInputSchema,
} from "@/lib/oauth-apps/validation";

describe("checkRedirectUri", () => {
  it.each([
    "https://acme.com/callback",
    "https://acme.com/oauth/qrdx/callback?tenant=eu",
    "https://app.acme.com:8443/cb",
    "https://acme.com",
    "http://localhost:3000/callback",
    "http://127.0.0.1:8080/cb",
    "http://[::1]:3000/cb",
    "https://localhost/cb",
  ])("accepts %s, kept exactly as typed", (uri) => {
    expect(checkRedirectUri(`  ${uri} `)).toEqual({ ok: true, url: uri });
  });

  it.each([
    ["", "Enter a redirect URI"],
    ["javascript:alert(1)", "full URL"],
    ["JaVaScRiPt:alert(document.cookie)//https://acme.com", "full URL"],
    ["data:text/html,<script>alert(1)</script>", "full URL"],
    ["vbscript:msgbox", "full URL"],
    ["file:///etc/passwd", "full URL"],
    ["ftp://acme.com/cb", "full URL"],
    ["myapp://callback", "full URL"],
    ["//acme.com/callback", "full URL"],
    ["/callback", "full URL"],
    ["acme.com/callback", "full URL"],
    ["https:acme.com/callback", "full URL"],
    ["http://acme.com/callback", "https://"],
    ["http://localhost.evil.com/cb", "https://"],
    ["http://192.168.1.10/cb", "https://"],
    ["https://*.acme.com/callback", "Wildcards"],
    ["https://acme.com/*", "Wildcards"],
    ["https://acme.com/callback#token", "fragment"],
    ["https://acme.com/callback#", "fragment"],
    ["https://user:pass@acme.com/cb", "username or password"],
    ["https://evil.com@acme.com/cb", "username or password"],
    ["https://acme.com/call back", "spaces"],
    ["https://acme.com/cb\nhttps://evil.com", "spaces"],
    ["https://acme.com\\@evil.com/cb", "backslashes"],
    ["https://acme.com/\u0000cb", "control characters"],
    [`https://acme.com/${"a".repeat(2100)}`, "up to 2048"],
  ])("rejects %j", (uri, message) => {
    const result = checkRedirectUri(uri);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain(message);
  });
});

it("trims surrounding whitespace instead of rejecting it", () => {
  expect(checkRedirectUri("\thttps://acme.com/cb\n")).toEqual({
    ok: true,
    url: "https://acme.com/cb",
  });
});

describe("checkRedirectUris", () => {
  it("ignores blank lines and drops exact duplicates only", () => {
    expect(
      checkRedirectUris([
        "https://acme.com/cb",
        "",
        "  ",
        "https://acme.com/cb",
        "https://acme.com/cb/",
      ]),
    ).toEqual({
      ok: true,
      uris: ["https://acme.com/cb", "https://acme.com/cb/"],
    });
  });

  it("needs at least one URI", () => {
    expect(checkRedirectUris(["", " "])).toEqual({
      ok: false,
      message: "Add at least one redirect URI.",
    });
  });

  it(`allows at most ${MAX_REDIRECT_URIS}`, () => {
    const uris = Array.from(
      { length: MAX_REDIRECT_URIS + 1 },
      (_, i) => `https://acme.com/cb/${i}`,
    );
    expect(checkRedirectUris(uris.slice(0, MAX_REDIRECT_URIS)).ok).toBe(true);
    expect(checkRedirectUris(uris).ok).toBe(false);
  });

  it("names the URI that failed", () => {
    const result = checkRedirectUris([
      "https://acme.com/cb",
      "http://acme.com",
    ]);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toMatch(/^http:\/\/acme\.com: /);
  });
});

describe("isAllowedRedirectUri", () => {
  const registered = [
    "https://acme.com/callback",
    "http://localhost:3000/cb",
    "https://acme.com/cb?tenant=eu",
  ];

  it.each(registered)("accepts the registered %s", (uri) => {
    expect(isAllowedRedirectUri(uri, registered)).toBe(true);
  });

  it.each([
    // Look-alikes of a registered URI
    "https://acme.com/callback/",
    "https://acme.com/callback/../evil",
    "https://acme.com/callbackx",
    "https://acme.com/callback?next=https://evil.com",
    "https://acme.com/callback#frag",
    "https://ACME.com/callback",
    "https://acme.com:443/callback",
    "https://acme.com.evil.com/callback",
    "https://evil.com/?https://acme.com/callback",
    "http://acme.com/callback",
    "http://localhost:3001/cb",
    "https://acme.com/cb?tenant=us",
    "https://acme.com/cb",
    " https://acme.com/callback",
    "",
  ])("rejects %j", (uri) => {
    expect(isAllowedRedirectUri(uri, registered)).toBe(false);
  });

  it("refuses dangerous URIs even if one was registered before the rules", () => {
    const legacy = [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://acme.com/cb#x",
      "https://user:pw@acme.com/cb",
    ];
    for (const uri of legacy) {
      expect(isAllowedRedirectUri(uri, legacy)).toBe(false);
    }
  });

  it("still accepts a legacy plain-http URI registered by the QRdx team", () => {
    expect(
      isAllowedRedirectUri("http://intranet.example/cb", [
        "http://intranet.example/cb",
      ]),
    ).toBe(true);
  });
});

describe("checkOptionalUrl", () => {
  it("allows empty", () => {
    expect(checkOptionalUrl("  ", "Website")).toEqual({ ok: true, url: "" });
  });

  it("normalises https URLs", () => {
    expect(checkOptionalUrl("https://Acme.com", "Website")).toEqual({
      ok: true,
      url: "https://acme.com/",
    });
  });

  it.each([
    "javascript:alert(1)",
    "http://acme.com",
    "acme.com",
    "https://u:p@acme.com",
  ])("rejects %s", (url) => {
    expect(checkOptionalUrl(url, "Website").ok).toBe(false);
  });
});

describe("oauthAppInputSchema", () => {
  const valid = {
    name: "  Acme  ",
    description: "",
    websiteUrl: "",
    logoUrl: "https://acme.com/logo.png",
    redirectUris: ["https://acme.com/cb", ""],
    scopes: ["codes:write", "profile:read", "codes:write"],
    pkceRequired: true,
  };

  it("trims, drops empties and orders scopes", () => {
    expect(oauthAppInputSchema.parse(valid)).toEqual({
      name: "Acme",
      description: null,
      websiteUrl: null,
      logoUrl: "https://acme.com/logo.png",
      redirectUris: ["https://acme.com/cb"],
      scopes: ["profile:read", "codes:write"],
      pkceRequired: true,
    });
  });

  it.each([
    { scopes: [] },
    { scopes: ["admin:all"] },
    { name: "A" },
    { name: "x".repeat(61) },
    { redirectUris: ["https://*.acme.com/cb"] },
    { logoUrl: "javascript:alert(1)" },
  ])("rejects %j", (patch) => {
    expect(oauthAppInputSchema.safeParse({ ...valid, ...patch }).success).toBe(
      false,
    );
  });
});
