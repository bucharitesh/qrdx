// Safety screening of a large batch (lib/safety/destinations.ts): Web Risk
// lookups run 16 at a time, stop at the batch's time budget (the rest get
// the offline checks, as in an outage), and every blocked row is listed by
// its index in the request. Web Risk is a fake that answers in LOOKUP_MS.
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOOKUP_MS = 20;
const state = vi.hoisted(() => ({
  lookups: 0,
  inFlight: 0,
  maxInFlight: 0,
  threats: new Set<string>(),
  isNew: false,
  velocity: [] as { adding: number; paid: boolean | undefined }[],
}));

vi.mock("@/lib/safety/web-risk", () => ({
  lookupWebRisk: async (url: string) => {
    state.lookups++;
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    await new Promise((resolve) => setTimeout(resolve, LOOKUP_MS));
    state.inFlight--;
    return state.threats.has(url)
      ? { status: "threat", threats: ["MALWARE"] }
      : { status: "safe" };
  },
}));
vi.mock("@/lib/safety/velocity", () => ({
  enforceNewAccountVelocity: async (
    _userId: string,
    adding: number,
    options?: { paid?: boolean },
  ) => {
    state.velocity.push({ adding, paid: options?.paid });
  },
  getAccountStanding: async () => ({ isNew: state.isNew }),
  fileHoldReports: () => {},
}));

const { lookupConcurrency, screenNewCodes } = await import(
  "@/lib/safety/destinations"
);

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `row_${i}`,
    destinationUrl: `https://shop.example.com/item/${i}`,
  }));

beforeEach(() => {
  state.lookups = 0;
  state.inFlight = 0;
  state.maxInFlight = 0;
  state.threats = new Set();
  state.velocity = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("screenNewCodes for batches", () => {
  it("looks 1,000 rows up 16 at a time", async () => {
    expect(lookupConcurrency(1000)).toBe(16);
    expect(lookupConcurrency(10)).toBe(8);
    const started = performance.now();
    const screened = await screenNewCodes({ userId: "u" }, rows(1000));
    const elapsed = performance.now() - started;
    expect(screened).toHaveLength(1000);
    expect(state.lookups).toBe(1000);
    expect(state.maxInFlight).toBe(16);
    // 1000 / 16 rounds of LOOKUP_MS each, plus slack.
    expect(elapsed).toBeLessThan((1000 / 16) * LOOKUP_MS * 2.5);
  });

  it("stops waiting for Web Risk at the budget; the rest get offline checks", async () => {
    const started = performance.now();
    const screened = await screenNewCodes({ userId: "u" }, rows(1000), {
      budgetMs: 100,
    });
    const elapsed = performance.now() - started;
    expect(screened).toHaveLength(1000);
    expect(state.lookups).toBeGreaterThan(0);
    expect(state.lookups).toBeLessThan(200);
    expect(elapsed).toBeLessThan(600);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("safety.web_risk_budget_spent"),
    );
  });

  it("lists every blocked row by its index in the request", async () => {
    const batch = rows(30);
    state.threats = new Set([
      batch[4]?.destinationUrl as string,
      batch[17]?.destinationUrl as string,
    ]);
    const error = await screenNewCodes({ userId: "u" }, batch, {
      indexOf: (position) => position + 100,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      status: 422,
      code: "UNSAFE_DESTINATION",
      data: {
        details: [
          { index: 104, path: "104.destinationUrl" },
          { index: 117, path: "117.destinationUrl" },
        ],
      },
    });
  });

  it("tells the new-account cap whether the workspace is paid", async () => {
    await screenNewCodes({ userId: "u" }, rows(2), { paid: true });
    await screenNewCodes({ userId: "u" }, rows(3));
    expect(state.velocity).toEqual([
      { adding: 2, paid: true },
      { adding: 3, paid: false },
    ]);
  });
});
