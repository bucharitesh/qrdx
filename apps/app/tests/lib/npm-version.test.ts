// The site shows the version npm installs, cached for an hour, and falls
// back to the repo's package.json when the registry can't answer.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareVersions,
  getLatestVersion,
  getNpmLag,
} from "@/lib/npm-version";
import cliPackage from "../../../../packages/cli/package.json";
import qrdxPackage from "../../../../packages/qrdx/package.json";

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => Response.json(body, { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getLatestVersion", () => {
  it("asks the registry for the latest tag, revalidated hourly", async () => {
    const fetch = respond({ version: "1.2.3" });
    vi.stubGlobal("fetch", fetch);
    expect(await getLatestVersion("@qrdx/cli")).toBe("1.2.3");
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit & { next?: { revalidate?: number } },
    ];
    expect(url).toBe("https://registry.npmjs.org/%40qrdx%2Fcli/latest");
    expect(init.next?.revalidate).toBe(3600);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to the repo's package.json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    );
    expect(await getLatestVersion("qrdx")).toBe(qrdxPackage.version);

    vi.stubGlobal("fetch", respond({ error: "Not found" }, 404));
    expect(await getLatestVersion("@qrdx/cli")).toBe(cliPackage.version);

    vi.stubGlobal("fetch", respond({ version: "<b>9</b>" }));
    expect(await getLatestVersion("qrdx")).toBe(qrdxPackage.version);
  });
});

describe("compareVersions", () => {
  it("orders x.y.z numerically", () => {
    expect(compareVersions("0.0.46", "0.0.47")).toBeLessThan(0);
    expect(compareVersions("0.0.10", "0.0.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.0.99")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0);
  });
});

// The "not on npm yet" notice on the library, CLI, changelog and compare
// pages: shown only while npm is known to be behind, gone once it catches up.
describe("getNpmLag", () => {
  it("reports what npm has and what is coming while npm is behind", async () => {
    vi.stubGlobal("fetch", respond({ version: "0.0.46" }));
    expect(await getNpmLag("qrdx", "0.0.47")).toEqual({
      name: "qrdx",
      published: "0.0.46",
      upcoming: "0.0.47",
    });
  });

  it("compares with the repo's package.json by default", async () => {
    vi.stubGlobal("fetch", respond({ version: "0.0.1" }));
    expect(await getNpmLag("@qrdx/cli")).toEqual({
      name: "@qrdx/cli",
      published: "0.0.1",
      upcoming: cliPackage.version,
    });
  });

  it("goes away once npm has the version, or a newer one", async () => {
    vi.stubGlobal("fetch", respond({ version: qrdxPackage.version }));
    expect(await getNpmLag("qrdx")).toBeNull();

    vi.stubGlobal("fetch", respond({ version: "9.0.0" }));
    expect(await getNpmLag("qrdx")).toBeNull();
  });

  it("claims nothing when npm can't be reached or answers nonsense", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await getNpmLag("qrdx", "0.0.47")).toBeNull();

    vi.stubGlobal("fetch", respond({ error: "Service Unavailable" }, 503));
    expect(await getNpmLag("qrdx", "0.0.47")).toBeNull();

    vi.stubGlobal("fetch", respond({ version: "latest" }));
    expect(await getNpmLag("qrdx", "0.0.47")).toBeNull();
  });

  it("ignores an entry version that isn't semver", async () => {
    const fetch = respond({ version: "0.0.46" });
    vi.stubGlobal("fetch", fetch);
    expect(await getNpmLag("qrdx", "next")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
