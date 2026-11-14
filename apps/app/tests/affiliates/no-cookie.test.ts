// D-C1: no cookie. An affiliate's code only rides along with a sign-up in
// the same visit: the browser side keeps it in the page's memory and the
// address bar, never in a cookie, localStorage or sessionStorage, and no
// server response of the program sets one. Checked by running the browser
// code against a stand-in document, and by reading every file of the
// program for a way to store something on the device.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureReferralFromUrl,
  forgetPendingReferral,
  pendingReferralCode,
} from "@/lib/affiliates/referral-client";

const root = join(import.meta.dirname, "../..");

afterEach(() => {
  forgetPendingReferral();
  vi.unstubAllGlobals();
});

describe("the browser side", () => {
  it("keeps the link's code in memory only", () => {
    const writes: string[] = [];
    const storage = () => ({
      getItem: () => null,
      setItem: (key: string) => writes.push(`storage:${key}`),
      removeItem: () => {},
    });
    const document = {};
    Object.defineProperty(document, "cookie", {
      get: () => "",
      set: (value: string) => writes.push(`cookie:${value}`),
    });
    vi.stubGlobal("document", document);
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
    vi.stubGlobal("window", {
      location: { search: "?ref=k7q2mx9p", protocol: "https:" },
      localStorage: storage(),
      sessionStorage: storage(),
    });

    expect(captureReferralFromUrl()).toBe("k7q2mx9p");
    // Another page of the same visit, without the code in its address.
    (globalThis.window as { location: { search: string } }).location.search =
      "";
    expect(pendingReferralCode()).toBe("k7q2mx9p");
    expect(writes).toEqual([]);

    // A reload starts over: nothing was stored to bring it back.
    forgetPendingReferral();
    expect(pendingReferralCode()).toBeNull();
  });
});

/** Every source file of the program, browser and server. */
function programFiles(): string[] {
  const roots = [
    "lib/affiliates",
    "app/r",
    "app/(app)/(home)/affiliates",
    "app/(app)/settings/affiliate",
    "app/(app)/admin/affiliates",
    "components/referral-capture.tsx",
    "../../packages/auth/referral.ts",
    "../../packages/auth/referral-keys.ts",
  ];
  const files: string[] = [];
  const walk = (path: string) => {
    const full = join(root, path);
    if (statSync(full).isDirectory()) {
      for (const entry of readdirSync(full)) walk(join(path, entry));
    } else if (/\.(ts|tsx)$/.test(path)) {
      files.push(full);
    }
  };
  for (const path of roots) walk(path);
  return files;
}

describe("the program's code", () => {
  it("has no way to store a code on the device", () => {
    const files = programFiles();
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8")
        // Comments may say "no cookie".
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      return [
        /document\.cookie\s*=/,
        /cookies\(\)\s*\.set|\.cookies\.set\(/,
        /set-cookie/i,
        /localStorage|sessionStorage|indexedDB/,
        /qrdx_ref/,
      ]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(root, file)}: ${pattern}`);
    });
    expect(offenders).toEqual([]);
  });

  it("isn't tied to cookie consent any more", () => {
    for (const path of [
      "../../packages/analytics/consent/config.ts",
      "../../packages/analytics/consent/consent-scripts.tsx",
      "../../packages/analytics/consent/cookie-preferences.tsx",
      "content/legal/cookie-policy.mdx",
    ]) {
      const source = readFileSync(join(root, path), "utf8");
      expect(source, path).not.toMatch(/qrdx_ref|affiliate|referral/i);
    }
  });
});
