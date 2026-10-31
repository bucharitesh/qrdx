// Link-check internals: SSRF guard, redirect-chain resolution and the report.
// No external network: hops are faked, and requestHop only talks to a
// loopback server started here.
//   cd apps/docs && npx tsx --test app/api/scan/check/_lib/scan-check.test.ts
import assert from "node:assert/strict";
import type { LookupAddress } from "node:dns";
import http from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { after, before, describe, it } from "node:test";
import { fetchHop, HopError, type HopResponse, requestHop } from "./hop";
import { buildReport } from "./report";
import { type ChainResult, MAX_HOPS, resolveChain } from "./resolve";
import {
  createGuardedLookup,
  fetchBlockReason,
  isBlockedAddress,
} from "./ssrf";

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local, metadata and embedded-IPv4 forms", () => {
    for (const address of [
      "0.0.0.0",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.5.4",
      "192.168.1.1",
      "100.100.100.200",
      "169.254.169.254",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fe80::1",
      "fe80::1%en0",
      "fd00:ec2::254",
      "fc00::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::7f00:1",
      "2002:7f00:1::",
      "2001:db8::1",
      "ff02::1",
      "not-an-ip",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  it("allows public addresses", () => {
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "76.76.21.21",
      "2606:4700:4700::1111",
    ]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });
});

describe("fetchBlockReason", () => {
  const reason = (url: string) => fetchBlockReason(new URL(url));

  it("refuses private hosts in every spelling", () => {
    for (const url of [
      "http://localhost/",
      "http://app.localhost/",
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://[::1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/",
      "http://intranet/",
      "http://printer.local/",
    ]) {
      assert.equal(reason(url), "private-address", url);
    }
  });

  it("refuses credentials, odd ports and other schemes", () => {
    assert.equal(reason("https://user:pass@example.com/"), "credentials");
    assert.equal(reason("https://example.com:8443/"), "port");
    assert.equal(reason("http://example.com:22/"), "port");
    assert.equal(reason("ftp://example.com/"), "unsupported-scheme");
    assert.equal(reason("market://details?id=x"), "unsupported-scheme");
  });

  it("allows public http(s) on default ports", () => {
    assert.equal(reason("https://example.com/path?q=1"), null);
    assert.equal(reason("http://example.com:80/"), null);
    assert.equal(reason("https://93.184.215.14/"), null);
  });
});

describe("createGuardedLookup", () => {
  const fakeDns =
    (answers: Record<string, LookupAddress[]>) =>
    (
      hostname: string,
      _options: unknown,
      callback: (
        error: NodeJS.ErrnoException | null,
        addresses: LookupAddress[],
      ) => void,
    ) => {
      const answer = answers[hostname];
      if (answer) callback(null, answer);
      else
        callback(
          Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }),
          [],
        );
    };

  const run = (lookup: LookupFunction, hostname: string, all: boolean) =>
    new Promise<{ error: NodeJS.ErrnoException | null; result: unknown }>(
      (resolve) => {
        lookup(hostname, { all }, (error, address, family) =>
          resolve({ error, result: all ? address : { address, family } }),
        );
      },
    );

  const lookup = createGuardedLookup(
    fakeDns({
      "public.test": [{ address: "93.184.215.14", family: 4 }],
      "rebind.test": [
        { address: "93.184.215.14", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
      "v6local.test": [{ address: "::1", family: 6 }],
    }),
  );

  it("passes public answers through (single and all)", async () => {
    const single = await run(lookup, "public.test", false);
    assert.equal(single.error, null);
    assert.deepEqual(single.result, { address: "93.184.215.14", family: 4 });
    const all = await run(lookup, "public.test", true);
    assert.deepEqual(all.result, [{ address: "93.184.215.14", family: 4 }]);
  });

  it("refuses a host when any answer is private", async () => {
    for (const host of ["rebind.test", "v6local.test"]) {
      const { error } = await run(lookup, host, false);
      assert.equal(error?.code, "EBLOCKED", host);
    }
  });

  it("passes DNS errors through", async () => {
    const { error } = await run(lookup, "missing.test", false);
    assert.equal(error?.code, "ENOTFOUND");
  });
});

describe("requestHop (loopback server)", () => {
  let server: http.Server;
  let port = 0;
  let bodyBytesSent = 0;
  const methods: string[] = [];

  before(async () => {
    server = http.createServer((request, response) => {
      methods.push(request.method ?? "");
      if (request.url === "/redirect") {
        response.writeHead(302, { Location: "/final" });
        response.end();
        return;
      }
      if (request.url === "/no-head" && request.method === "HEAD") {
        response.writeHead(405);
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/plain" });
      if (request.method === "GET") {
        // A large body the client must not wait for.
        const chunk = "x".repeat(64 * 1024);
        const write = () => {
          while (bodyBytesSent < 50 * 1024 * 1024) {
            bodyBytesSent += chunk.length;
            if (!response.write(chunk)) {
              response.once("drain", write);
              return;
            }
          }
          response.end();
        };
        write();
      } else {
        response.end();
      }
    });
    server.on("clientError", () => {});
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  after(() => {
    server.closeAllConnections();
    server.close();
  });

  // The guard is replaced only here, to reach the loopback test server.
  const loopback: LookupFunction = (_hostname, options, callback) => {
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, [
        { address: "127.0.0.1", family: 4 },
      ]);
    } else {
      callback(null, "127.0.0.1", 4);
    }
  };
  const url = (path: string) => new URL(`http://loopback.test:${port}${path}`);

  it("reads only status and Location", async () => {
    const result = await requestHop(url("/redirect"), "HEAD", 2000, loopback);
    assert.deepEqual(result, { status: 302, location: "/final" });
  });

  it("does not download GET bodies", async () => {
    const result = await requestHop(url("/big"), "GET", 2000, loopback);
    assert.equal(result.status, 200);
    assert.ok(
      bodyBytesSent < 50 * 1024 * 1024,
      "body was streamed to completion",
    );
  });

  it("falls back to GET when HEAD is refused", async () => {
    methods.length = 0;
    const result = await fetchHop(
      url("/no-head"),
      2000,
      (target, method, timeout) =>
        requestHop(target, method, timeout, loopback),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(methods, ["HEAD", "GET"]);
  });

  it("refuses to connect when the guarded lookup resolves privately", async () => {
    await assert.rejects(
      requestHop(new URL(`http://localhost:${port}/`), "HEAD", 2000),
      (error: unknown) =>
        error instanceof HopError && error.code === "blocked-address",
    );
  });
});

describe("fetchHop", () => {
  it("retries a dropped HEAD with GET, but not DNS failures", async () => {
    const calls: string[] = [];
    const dropped = async (
      _url: URL,
      method: "HEAD" | "GET",
    ): Promise<HopResponse> => {
      calls.push(method);
      if (method === "HEAD")
        throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
      return { status: 301, location: "https://b.example/" };
    };
    assert.deepEqual(
      await fetchHop(new URL("https://a.example/"), 3000, dropped),
      {
        status: 301,
        location: "https://b.example/",
      },
    );
    assert.deepEqual(calls, ["HEAD", "GET"]);

    const dns = async (): Promise<HopResponse> => {
      throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    };
    await assert.rejects(
      fetchHop(new URL("https://a.example/"), 3000, dns),
      (error: unknown) => error instanceof HopError && error.code === "dns",
    );
  });
});

describe("resolveChain", () => {
  const fakeWeb =
    (routes: Record<string, HopResponse | Error>) =>
    async (url: URL): Promise<HopResponse> => {
      const answer = routes[url.toString()];
      if (!answer) return { status: 404, location: null };
      if (answer instanceof Error) throw answer;
      return answer;
    };

  it("follows relative and absolute redirects to the final page", async () => {
    const chain = await resolveChain(new URL("https://short.example/abc"), {
      fetchHop: fakeWeb({
        "https://short.example/abc": {
          status: 301,
          location: "https://mid.example/x",
        },
        "https://mid.example/x": { status: 302, location: "/landing?ref=qr" },
        "https://mid.example/landing?ref=qr": { status: 200, location: null },
      }),
    });
    assert.equal(chain.complete, true);
    assert.equal(chain.finalUrl, "https://mid.example/landing?ref=qr");
    assert.deepEqual(
      chain.hops.map((hop) => hop.status),
      [301, 302, 200],
    );
  });

  it("stops after MAX_HOPS urls", async () => {
    const routes: Record<string, HopResponse> = {};
    for (let i = 0; i < 10; i++) {
      routes[`https://r.example/${i}`] = { status: 302, location: `/${i + 1}` };
    }
    const chain = await resolveChain(new URL("https://r.example/0"), {
      fetchHop: fakeWeb(routes),
    });
    assert.equal(chain.stop, "too-many-redirects");
    assert.equal(chain.complete, false);
    assert.equal(chain.hops.length, MAX_HOPS);
  });

  it("detects loops", async () => {
    const chain = await resolveChain(new URL("https://a.example/"), {
      fetchHop: fakeWeb({
        "https://a.example/": { status: 302, location: "https://b.example/" },
        "https://b.example/": { status: 302, location: "https://a.example/" },
      }),
    });
    assert.equal(chain.stop, "loop");
  });

  it("never requests a redirect into a private network", async () => {
    const requested: string[] = [];
    const chain = await resolveChain(new URL("https://evil.example/"), {
      fetchHop: async (url) => {
        requested.push(url.toString());
        return {
          status: 302,
          location: "http://169.254.169.254/latest/meta-data/",
        };
      },
    });
    assert.deepEqual(requested, ["https://evil.example/"]);
    assert.equal(chain.stop, "private-address");
    assert.equal(chain.finalUrl, "http://169.254.169.254/latest/meta-data/");
  });

  it("treats app links as a complete destination", async () => {
    const chain = await resolveChain(new URL("https://app.example/"), {
      fetchHop: fakeWeb({
        "https://app.example/": {
          status: 302,
          location: "market://details?id=com.example",
        },
      }),
    });
    assert.equal(chain.complete, true);
    assert.equal(chain.finalUrl, "market://details?id=com.example");
  });

  it("reports hop errors and the time budget", async () => {
    const failing = await resolveChain(new URL("https://down.example/"), {
      fetchHop: fakeWeb({
        "https://down.example/": new HopError("timeout", "slow"),
      }),
    });
    assert.equal(failing.stop, "timeout");

    let clock = 0;
    const slow = await resolveChain(new URL("https://a.example/"), {
      now: () => clock,
      fetchHop: async () => {
        clock += 5000;
        return { status: 302, location: `https://a.example/${clock}` };
      },
    });
    assert.equal(slow.stop, "timeout");
    assert.ok(slow.hops.length < MAX_HOPS);
  });

  it("resolves internal (QRdx) hops without HTTP and can hide the destination", async () => {
    const requested: string[] = [];
    const chain = await resolveChain(new URL("https://qrdx.dev/q/AbC1234"), {
      fetchHop: async (url) => {
        requested.push(url.toString());
        return { status: 200, location: null };
      },
      resolveInternal: async (url) =>
        url.hostname === "qrdx.dev" ? { next: "https://shop.example/" } : null,
    });
    assert.deepEqual(requested, ["https://shop.example/"]);
    assert.deepEqual(chain.hops, [
      { url: "https://qrdx.dev/q/AbC1234", status: null },
      { url: "https://shop.example/", status: 200 },
    ]);

    const hidden = await resolveChain(new URL("https://qrdx.dev/q/AbC1234"), {
      fetchHop: async () => assert.fail("must not fetch"),
      resolveInternal: async () => ({ next: null, hidden: true }),
    });
    assert.equal(hidden.finalUrl, null);
    assert.equal(hidden.hidden, true);
  });
});

describe("buildReport", () => {
  const chainOf = (
    urls: string[],
    extra: Partial<ChainResult> = {},
  ): ChainResult => ({
    hops: urls.map((url, index) => ({
      url,
      status: index === urls.length - 1 ? 200 : 302,
    })),
    finalUrl: urls.at(-1) ?? null,
    complete: true,
    stop: null,
    finalStatus: 200,
    hidden: false,
    ...extra,
  });
  const codes = (report: ReturnType<typeof buildReport>) =>
    report.findings.map((finding) => finding.code);

  it("is ok for a plain https page", () => {
    const report = buildReport({
      url: "https://example.com/",
      chain: chainOf(["https://example.com/"]),
      qrdx: null,
      webRisk: new Map([["https://example.com/", { status: "safe" }]]),
    });
    assert.equal(report.verdict, "ok");
    assert.equal(report.webRisk, "clean");
    assert.deepEqual(report.findings, []);
  });

  it("is dangerous when Web Risk flags any hop", () => {
    const report = buildReport({
      url: "https://bit.ly/x",
      chain: chainOf(["https://bit.ly/x", "https://phish.example/login"]),
      qrdx: null,
      webRisk: new Map([
        ["https://bit.ly/x", { status: "safe" }],
        [
          "https://phish.example/login",
          { status: "threat", threats: ["SOCIAL_ENGINEERING"] },
        ],
      ]),
    });
    assert.equal(report.verdict, "danger");
    assert.equal(report.webRisk, "threat");
    assert.equal(report.findings[0]?.code, "web-risk-SOCIAL_ENGINEERING");
    assert.ok(codes(report).includes("shortener"));
  });

  it("flags lookalike domains, credentials, brand misuse and insecure pages", () => {
    const homoglyph = buildReport({
      url: "https://xn--pple-43d.com/",
      chain: chainOf(["https://xn--pple-43d.com/"]),
      qrdx: null,
      webRisk: null,
    });
    assert.equal(homoglyph.verdict, "danger");
    assert.ok(codes(homoglyph).includes("homoglyph"));
    assert.equal(homoglyph.webRisk, "not-configured");

    const brand = buildReport({
      url: "http://paypal.com.account-verify.example/",
      chain: chainOf(["http://paypal.com.account-verify.example/"]),
      qrdx: null,
      webRisk: null,
    });
    assert.equal(brand.verdict, "caution");
    assert.ok(codes(brand).includes("brand"));
    assert.ok(codes(brand).includes("insecure"));

    for (const legit of [
      "https://www.paypal.com/",
      "https://accounts.google.co.uk/",
      "https://applebees.com/",
    ]) {
      const report = buildReport({
        url: legit,
        chain: chainOf([legit]),
        qrdx: null,
        webRisk: null,
      });
      assert.equal(report.verdict, "ok", legit);
    }

    const credentials = buildReport({
      url: "https://google.com@evil.example/",
      chain: chainOf(["https://google.com@evil.example/"], {
        complete: false,
        stop: "credentials",
      }),
      qrdx: null,
      webRisk: null,
    });
    assert.equal(credentials.verdict, "danger");
  });

  it("explains a private address once and reports skipped lookups", () => {
    const report = buildReport({
      url: "http://192.168.1.1/",
      chain: chainOf(["http://192.168.1.1/"], {
        complete: false,
        stop: "private-address",
        finalStatus: null,
      }),
      qrdx: null,
      webRisk: new Map(),
    });
    assert.deepEqual(codes(report), ["ip-address", "private-network"]);
    assert.equal(report.webRisk, "not-checked");
  });

  it("warns when the chain can't be followed", () => {
    const report = buildReport({
      url: "https://slow.example/",
      chain: chainOf(["https://slow.example/"], {
        complete: false,
        stop: "timeout",
        finalStatus: null,
      }),
      qrdx: null,
      webRisk: null,
    });
    assert.equal(report.verdict, "caution");
    assert.ok(codes(report).includes("stop-timeout"));
  });

  it("shows the verified badge for active, unreported QRdx codes only", () => {
    const qrdx = {
      slug: "AbC1234",
      verified: true,
      status: "active" as const,
      kind: "redirect" as const,
      hasRules: true,
    };
    const verified = buildReport({
      url: "https://qrdx.dev/q/AbC1234",
      chain: chainOf(["https://qrdx.dev/q/AbC1234", "https://shop.example/"]),
      qrdx,
      webRisk: null,
    });
    assert.equal(verified.verdict, "verified");
    assert.ok(codes(verified).includes("qrdx-rules"));

    const reported = buildReport({
      url: "https://qrdx.dev/q/AbC1234",
      chain: chainOf(["https://qrdx.dev/q/AbC1234", "https://shop.example/"]),
      qrdx: { ...qrdx, verified: false },
      webRisk: null,
    });
    assert.equal(reported.verdict, "ok");

    const flagged = buildReport({
      url: "https://qrdx.dev/q/AbC1234",
      chain: chainOf(["https://qrdx.dev/q/AbC1234", "https://bad.example/"]),
      qrdx,
      webRisk: new Map([
        ["https://bad.example/", { status: "threat", threats: ["MALWARE"] }],
      ]),
    });
    assert.equal(flagged.verdict, "danger");
  });

  it("hides a password-protected destination", () => {
    const report = buildReport({
      url: "https://qrdx.dev/q/AbC1234",
      chain: {
        hops: [{ url: "https://qrdx.dev/q/AbC1234", status: null }],
        finalUrl: null,
        complete: true,
        stop: null,
        finalStatus: null,
        hidden: true,
      },
      qrdx: {
        slug: "AbC1234",
        verified: true,
        status: "password",
        kind: "redirect",
        hasRules: false,
      },
      webRisk: null,
    });
    assert.equal(report.finalUrl, null);
    assert.ok(codes(report).includes("qrdx-password"));
    assert.equal(JSON.stringify(report).includes("shop"), false);
  });
});
