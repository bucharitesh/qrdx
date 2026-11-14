// Destinations created without a Web Risk answer (lib/safety/recheck.ts):
// looked up again after the response and by the webhook worker. A flagged
// one is switched off with an "auto-threat" report, as a flagged report is
// today; answered ones are cleared; an outage leaves them pending.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  verdicts: new Map<string, "threat" | "safe" | "error" | "unsupported">(),
  lookups: 0,
  scheduled: 0,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/safety/web-risk", () => ({
  lookupWebRisk: async (url: string) => {
    state.lookups++;
    const verdict = state.verdicts.get(url) ?? "safe";
    if (verdict === "threat") {
      return { status: "threat", threats: ["SOCIAL_ENGINEERING"] };
    }
    if (verdict === "safe") return { status: "safe" };
    return { status: "unknown", reason: verdict };
  },
}));
vi.mock("@/lib/events/worker-due", () => ({
  scheduleWorkerRun: async () => {
    state.scheduled++;
  },
}));

const { recheckAfterResponse, recheckWebRisk } = await import(
  "@/lib/safety/recheck"
);

const NOW = Date.now();
const url = (name: string) => `https://shop.example.com/${name}`;

function code(id: string, name: string, pending = true) {
  return {
    id,
    userId: "u",
    organizationId: "org",
    slug: id,
    destinationUrl: url(name),
    isActive: true,
    webRiskRecheckAt: pending ? new Date(NOW - 1000) : null,
  };
}

const row = (id: string) => fakeDb.find("qrCode", { id });

beforeEach(() => {
  fakeDb.resetAll();
  state.verdicts = new Map();
  state.lookups = 0;
  state.scheduled = 0;
  fakeDb.seed("qrCode", [
    code("c_phish", "phish"),
    code("c_fine", "fine"),
    code("c_down", "down"),
    code("c_long", "long"),
    code("c_done", "done", false),
  ]);
  state.verdicts.set(url("phish"), "threat");
  state.verdicts.set(url("down"), "error");
  state.verdicts.set(url("long"), "unsupported");
});

describe("recheckWebRisk", () => {
  it("switches off a destination Web Risk flags and queues it for an admin", async () => {
    const summary = await recheckWebRisk({ deadline: Date.now() + 5000 });
    expect(summary).toEqual({ checked: 3, flagged: 1, pending: 1 });

    expect(row("c_phish")).toMatchObject({
      isActive: false,
      webRiskRecheckAt: null,
    });
    const [report] = fakeDb.rows("abuseReport");
    expect(report).toMatchObject({
      qrCodeId: "c_phish",
      reason: "auto-threat",
      status: "open",
      url: url("phish"),
    });
    expect(report?.details).toContain("phishing or a scam");
  });

  it("clears answered ones and keeps an outage pending for the next pass", async () => {
    await recheckWebRisk({ deadline: Date.now() + 5000 });
    expect(row("c_fine")).toMatchObject({
      isActive: true,
      webRiskRecheckAt: null,
    });
    expect(row("c_long")?.webRiskRecheckAt).toBeNull();
    expect(row("c_down")?.webRiskRecheckAt).toBeInstanceOf(Date);
    // Codes with nothing pending aren't looked up.
    expect(state.lookups).toBe(4);
    state.verdicts.set(url("down"), "safe");
    expect(await recheckWebRisk({ deadline: Date.now() + 5000 })).toEqual({
      checked: 1,
      flagged: 0,
      pending: 0,
    });
  });

  it("stops at the deadline, leaving the rest pending", async () => {
    const summary = await recheckWebRisk({ deadline: Date.now() - 1 });
    expect(summary).toEqual({ checked: 0, flagged: 0, pending: 4 });
    expect(state.lookups).toBe(0);
  });

  it("looks only at the given codes, and counts what's past the pass", async () => {
    expect(
      await recheckWebRisk({ ids: ["c_fine"], deadline: Date.now() + 5000 }),
    ).toEqual({ checked: 1, flagged: 0, pending: 0 });
    expect(row("c_phish")?.isActive).toBe(true);
    // Two at a time: more are pending past this pass.
    const summary = await recheckWebRisk({
      deadline: Date.now() + 5000,
      limit: 2,
    });
    expect(summary.pending).toBeGreaterThan(0);
  });
});

describe("recheckAfterResponse", () => {
  it("looks the new codes up and marks the worker due for what's left", async () => {
    recheckAfterResponse(["c_phish", "c_down"], 5000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(row("c_phish")?.isActive).toBe(false);
    expect(row("c_down")?.webRiskRecheckAt).toBeInstanceOf(Date);
    expect(state.scheduled).toBe(1);
  });

  it("does nothing without codes", async () => {
    recheckAfterResponse([], 5000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.lookups).toBe(0);
  });
});
