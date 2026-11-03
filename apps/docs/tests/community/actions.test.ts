// The community server actions (actions/community.ts): sign-in, the CC0
// licence and the input checks run first; the SVG import runs the engine's
// importer on the server and returns its warnings; a frame that passes
// every check is published. In-memory tables; nothing connects anywhere.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "u_ana" as string | null }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/shared", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getCurrentUserId: async () => {
      if (!state.userId) throw new UnauthorizedError();
      return state.userId;
    },
    logError: vi.fn(),
  };
});
vi.mock("@/lib/log-error", () => ({ logError: vi.fn() }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => null,
}));
vi.mock("@/lib/scope", () => ({ getActiveScope: vi.fn() }));

import { getOfficialFrame } from "qrdx";
import {
  importCommunityFrameSvg,
  publishCommunityFrame,
  saveCommunityProfileAction,
} from "@/actions/community";
import { fakeDb } from "../support/fake-db";

const wifi = getOfficialFrame("wifi-card");
if (!wifi) throw new Error("no wifi-card");

beforeEach(() => {
  fakeDb.resetAll();
  state.userId = "u_ana";
  fakeDb.defaults("communityProfile", { handle: null, status: "active" });
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana",
      email: "ana@example.com",
      image: null,
      banned: false,
    },
  ]);
});

describe("importCommunityFrameSvg", () => {
  it("keeps the shapes, drops scripts, links and text, and says so", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
      <script>alert(1)</script>
      <rect width="100" height="120" rx="8" fill="#123456" onclick="steal()"/>
      <a href="https://example.com"><circle cx="50" cy="10" r="4" fill="#ffcc00"/></a>
      <text x="10" y="115">Scan me</text>
      <rect id="qr" x="10" y="15" width="80" height="80" fill="#ffffff"/>
    </svg>`;
    const result = await importCommunityFrameSvg(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const json = JSON.stringify(result.data.spec);
    expect(json).not.toMatch(/script|alert|steal|example\.com|onclick/);
    expect(result.data.warnings.length).toBeGreaterThan(0);
    expect(result.data.palette.map((c) => c.color)).toContain("#123456");
  });

  it("refuses what the importer refuses, and signed-out visitors", async () => {
    const doctype = await importCommunityFrameSvg(
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    expect(doctype).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(await importCommunityFrameSvg("x".repeat(220_000))).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    state.userId = null;
    expect(await importCommunityFrameSvg("<svg/>")).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });
});

describe("publishCommunityFrame", () => {
  it("needs the licence, then publishes and links to the item", async () => {
    const frame = { style: "custom", spec: wifi.spec };
    expect(
      await publishCommunityFrame({
        frame,
        name: "Card",
        acceptLicense: false,
      }),
    ).toMatchObject({ ok: false, code: "LICENSE_REQUIRED" });
    const published = await publishCommunityFrame({
      frame,
      name: "Card",
      tags: ["wifi"],
      acceptLicense: true,
    });
    expect(published).toMatchObject({
      ok: true,
      data: {
        href: expect.stringMatching(/^\/community\/frames\/card-[a-z0-9]{4}$/),
      },
    });
    const again = await publishCommunityFrame({
      frame,
      name: "Card again",
      acceptLicense: true,
    });
    expect(again).toMatchObject({
      ok: false,
      code: "ALREADY_PUBLISHED",
      href: expect.stringMatching(/^\/community\/frames\//),
    });
  });

  it("explains a bad frame instead of failing", async () => {
    expect(
      await publishCommunityFrame({
        frame: { style: "custom", spec: { kind: "nope" } },
        name: "Broken",
        acceptLicense: true,
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("saveCommunityProfileAction", () => {
  it("returns the reason a handle can't be used", async () => {
    expect(
      await saveCommunityProfileAction({
        handle: "official",
        displayName: "Ana",
        showPicture: false,
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "That handle is reserved.",
    });
  });
});
