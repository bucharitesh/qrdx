// The site shows the version npm installs, cached for an hour, and falls
// back to the repo's package.json when the registry can't answer.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLatestVersion } from "@/lib/npm-version";
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
