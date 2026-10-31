// Run: cd apps/docs && npx tsx --test app/dashboard/domains/_lib/hostname.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDnsHostname,
  isPlatformHostname,
  parseCustomHostname,
  requestHostname,
} from "./hostname";

const accepted = (input: string) => {
  const result = parseCustomHostname(input);
  assert.ok(result.ok, `${input}: ${result.ok ? "" : result.error}`);
  return result.hostname;
};

const rejected = (input: string) => {
  const result = parseCustomHostname(input);
  assert.equal(result.ok, false, `${input} should be rejected`);
  return result.ok ? "" : result.error;
};

describe("parseCustomHostname", () => {
  it("normalizes what people paste", () => {
    assert.equal(accepted("go.brand.com"), "go.brand.com");
    assert.equal(accepted("  Go.Brand.COM  "), "go.brand.com");
    assert.equal(accepted("https://go.brand.com/"), "go.brand.com");
    assert.equal(accepted("http://go.brand.com/menu?x=1#top"), "go.brand.com");
    assert.equal(accepted("go.brand.com."), "go.brand.com");
    assert.equal(accepted("brand.co.uk"), "brand.co.uk");
    assert.equal(accepted("qr-1.my-brand.io"), "qr-1.my-brand.io");
  });

  it("stores internationalized names as punycode", () => {
    assert.equal(accepted("bücher.de"), "xn--bcher-kva.de");
    assert.equal(accepted("xn--bcher-kva.de"), "xn--bcher-kva.de");
  });

  it("rejects IP addresses", () => {
    assert.match(rejected("192.168.1.10"), /IP address/);
    assert.match(rejected("http://10.0.0.1/"), /IP address/);
    assert.match(rejected("[::1]"), /IP address/);
    // WHATWG URL turns this into 127.0.0.1
    assert.match(rejected("0x7f.1"), /IP address/);
  });

  it("rejects ports, credentials and malformed names", () => {
    rejected("");
    rejected("   ");
    rejected("go.brand.com:8080");
    rejected("user@go.brand.com");
    rejected("brand");
    rejected("-go.brand.com");
    rejected("go-.brand.com");
    rejected("go_qr.brand.com");
    rejected("go..brand.com");
    rejected("go.brand.c0m");
    rejected(`${"a".repeat(64)}.com`);
    rejected(`${"abcdefghi.".repeat(26)}com`);
  });

  it("rejects QRdx's own hosts and platform or special-use names", () => {
    for (const host of [
      "qrdx.dev",
      "www.qrdx.dev",
      "go.qrdx.dev",
      "localhost",
      "app.localhost",
      "my-app.vercel.app",
      "cname.vercel-dns.com",
      "printer.local",
      "site.test",
      "example.com",
      "go.example.org",
      "thing.internal",
    ]) {
      rejected(host);
    }
  });

  it("does not confuse lookalikes with QRdx's hosts", () => {
    assert.equal(accepted("notqrdx.dev"), "notqrdx.dev");
    assert.equal(accepted("qrdx.dev.brand.com"), "qrdx.dev.brand.com");
  });
});

describe("isPlatformHostname", () => {
  it("matches own hosts and their subdomains only", () => {
    assert.equal(isPlatformHostname("qrdx.dev"), true);
    assert.equal(isPlatformHostname("a.b.qrdx.dev"), true);
    assert.equal(isPlatformHostname("preview-123.vercel.app"), true);
    assert.equal(isPlatformHostname("xqrdx.dev"), false);
    assert.equal(isPlatformHostname("go.brand.com"), false);
  });
});

describe("requestHostname", () => {
  it("strips the port and lowercases", () => {
    assert.equal(requestHostname("Go.Brand.com"), "go.brand.com");
    assert.equal(requestHostname("go.brand.com:443"), "go.brand.com");
    assert.equal(requestHostname("go.brand.com."), "go.brand.com");
  });

  it("returns null for IPs, single labels and junk", () => {
    assert.equal(requestHostname(null), null);
    assert.equal(requestHostname(""), null);
    assert.equal(requestHostname("localhost:3000"), null);
    assert.equal(requestHostname("127.0.0.1:3000"), null);
    assert.equal(requestHostname("[::1]:3000"), null);
    assert.equal(requestHostname("bad host.com"), null);
  });
});

describe("isDnsHostname", () => {
  it("requires two labels and an alphabetic or punycode TLD", () => {
    assert.equal(isDnsHostname("go.brand.com"), true);
    assert.equal(isDnsHostname("xn--bcher-kva.xn--p1ai"), true);
    assert.equal(isDnsHostname("1.2.3.4"), false);
    assert.equal(isDnsHostname("com"), false);
  });
});

describe("proxy APP_PATHS (mirror of the string matchers in proxy.ts)", () => {
  // Kept in sync by hand with apps/docs/proxy.ts.
  const APP_PATHS =
    /^\/(?:editor\/theme\/[^/]+|dashboard(?:\/.*)?|settings(?:\/.*)?|success)$/;

  it("matches exactly the legacy matcher paths", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/domains",
      "/dashboard/codes/abc",
      "/settings",
      "/settings/general",
      "/success",
      "/editor/theme/abc",
    ]) {
      assert.equal(APP_PATHS.test(path), true, path);
    }
    for (const path of [
      "/",
      "/abc1234",
      "/q/abc1234",
      "/docs/x",
      "/dashboards",
      "/settingsx",
      "/success/x",
      "/editor/theme",
      "/editor/theme/a/b",
      "/api/auth/session",
    ]) {
      assert.equal(APP_PATHS.test(path), false, path);
    }
  });
});
