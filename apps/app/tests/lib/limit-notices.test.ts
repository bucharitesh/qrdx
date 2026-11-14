// Plan-limit emails (lib/limit-notices): owners get one email when a
// workspace reaches 90% of a capped limit and one at 100%, per limit and
// calendar month; the "sent" row is claimed before sending so it never
// repeats; nothing happens before manual-sql/0015 or where email can't go
// out (local dev and previews share the live database). sendEmail is a
// mock and the tables are in memory: no email is sent, nothing is stored.
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, repoDatabase } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
  deliveryAllowed: true,
  emailOn: true,
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed" },
  sent: [] as {
    to: string[];
    subject: string;
    react: ReactElement;
    idempotencyKey?: string;
  }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
  getPlan: async () => state.plan,
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => state.deliveryAllowed,
}));
vi.mock("@/lib/feature-availability", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/feature-availability")>();
  return {
    ...actual,
    isFeatureAvailable: (id: string) =>
      id === "email" ? state.emailOn : actual.isFeatureAvailable(id as never),
  };
});
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: vi.fn(async (options: (typeof state.sent)[number]) => {
    state.sent.push({
      ...options,
      to: Array.isArray(options.to) ? options.to : [options.to],
    });
    return state.sendResult;
  }),
}));

const { noticePeriod, noticeSubject, reachedThresholds } = await import(
  "@/lib/limit-notices/levels"
);
const { sendLimitNotice } = await import("@/lib/limit-notices/notify");
const { noteLimitUsage, limitNoticesCanSend } = await import(
  "@/lib/limit-notices"
);

const NOW = new Date("2026-11-04T12:00:00Z");
const scope = { userId: "u_bob", organizationId: "org_acme" };

function seedCodes(active: number) {
  fakeDb.seed(
    "qrCode",
    Array.from({ length: active }, (_, i) => ({
      id: `c_${i}`,
      userId: "u_bob",
      organizationId: "org_acme",
      slug: `slug${i}`,
      archivedAt: null,
      deletedAt: null,
    })),
  );
}

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique(
    "limitNotice",
    "organizationId",
    "limitId",
    "subject",
    "period",
    "threshold",
  );
  state.plan = "free";
  state.deliveryAllowed = true;
  state.emailOn = true;
  state.sendResult = { sent: true, id: "em_1" };
  state.sent.length = 0;
  fakeDb.seed("organization", [{ id: "org_acme", name: "Acme", slug: "acme" }]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: "org_acme", userId: "u_alice", role: "owner" },
    { id: "m2", organizationId: "org_acme", userId: "u_bob", role: "member" },
    {
      id: "m3",
      organizationId: "org_acme",
      userId: "u_carol",
      role: "admin,owner",
    },
  ]);
  fakeDb.seed("user", [
    { id: "u_alice", email: "alice@example.com", banned: false },
    { id: "u_bob", email: "bob@example.com", banned: false },
    { id: "u_carol", email: "carol@example.com", banned: false },
  ]);
});

describe("thresholds", () => {
  it("are 90 from 90% and 90 + 100 at the cap; none without a cap", () => {
    expect(reachedThresholds(8, 10)).toEqual([]);
    expect(reachedThresholds(9, 10)).toEqual([90]);
    expect(reachedThresholds(10, 10)).toEqual([90, 100]);
    expect(reachedThresholds(12, 10)).toEqual([90, 100]);
    expect(reachedThresholds(5, null)).toEqual([]);
    expect(reachedThresholds(3, 0)).toEqual([]);
    expect(noticePeriod(NOW)).toBe("2026-11");
    expect(
      noticeSubject("dynamicCodes", 90, {
        value: "9 of 10",
        workspace: "Acme",
      }),
    ).toBe("Dynamic QR codes: 9 of 10 used in Acme");
    expect(
      noticeSubject("storage", 100, { value: "x", workspace: "Acme" }),
    ).toBe("File storage: limit reached in Acme");
  });
});

describe("sendLimitNotice", () => {
  it("does nothing below 90%", async () => {
    seedCodes(8);
    expect(
      await sendLimitNotice(scope, "dynamicCodes", undefined, NOW),
    ).toEqual({ sent: null, reason: "under" });
    expect(state.sent).toHaveLength(0);
    expect(fakeDb.rows("limitNotice")).toHaveLength(0);
  });

  it("emails the owners once at 90% (counted like Plan & usage), then not again", async () => {
    seedCodes(9);
    const first = await sendLimitNotice(scope, "dynamicCodes", undefined, NOW);
    expect(first).toEqual({ sent: 90 });
    expect(state.sent).toHaveLength(1);
    const email = state.sent[0];
    expect(email?.to.sort()).toEqual([
      "alice@example.com",
      "carol@example.com",
    ]);
    expect(email?.subject).toBe("Dynamic QR codes: 9 of 10 used in Acme");
    expect(email?.idempotencyKey).toBe(
      "limit-notice:org_acme:dynamicCodes:workspace:2026-11:90",
    );
    const text = await render(email?.react as ReactElement, {
      plainText: true,
    });
    expect(text).toMatch(/acme is close to a plan limit/i);
    expect(text).toContain(
      "Acme has used 9 of 10 dynamic QR codes. 1 active dynamic code left on Free.",
    );
    expect(text).toContain("/dashboard/acme/settings/usage");
    expect(text).toContain("You get this because you're an owner of Acme");

    expect(
      await sendLimitNotice(scope, "dynamicCodes", undefined, NOW),
    ).toEqual({ sent: null, reason: "already" });
    expect(state.sent).toHaveLength(1);
    expect(fakeDb.rows("limitNotice")).toMatchObject([
      {
        organizationId: "org_acme",
        limitId: "dynamicCodes",
        subject: "",
        period: "2026-11",
        threshold: 90,
      },
    ]);
  });

  it("sends the 100% notice after the 90% one, and only one email when it jumps straight there", async () => {
    await sendLimitNotice(scope, "dynamicCodes", { used: 9, limit: 10 }, NOW);
    await sendLimitNotice(scope, "dynamicCodes", { used: 10, limit: 10 }, NOW);
    expect(state.sent.map((email) => email.subject)).toEqual([
      "Dynamic QR codes: 9 of 10 used in Acme",
      "Dynamic QR codes: limit reached in Acme",
    ]);
    const full = await render(state.sent[1]?.react as ReactElement, {
      plainText: true,
    });
    expect(full).toMatch(/acme has reached a plan limit/i);
    expect(full).toContain("Acme has used all its dynamic QR codes.");
    expect(full).toContain("Existing codes keep working.");

    state.sent.length = 0;
    await sendLimitNotice(scope, "landingPages", { used: 3, limit: 3 }, NOW);
    expect(state.sent).toHaveLength(1);
    expect(
      fakeDb
        .rows("limitNotice")
        .filter((row) => row.limitId === "landingPages")
        .map((row) => row.threshold)
        .sort(),
    ).toEqual([100, 90]);
    // And no "almost full" later in the month.
    await sendLimitNotice(scope, "landingPages", { used: 2.8, limit: 3 }, NOW);
    expect(state.sent).toHaveLength(1);
  });

  it("sends once when two writes race", async () => {
    await Promise.all([
      sendLimitNotice(scope, "savedThemes", { used: 9, limit: 10 }, NOW),
      sendLimitNotice(scope, "savedThemes", { used: 9, limit: 10 }, NOW),
    ]);
    expect(state.sent).toHaveLength(1);
  });

  it("starts over next month", async () => {
    await sendLimitNotice(scope, "formResponses", { used: 50, limit: 50 }, NOW);
    await sendLimitNotice(
      scope,
      "formResponses",
      { used: 50, limit: 50 },
      new Date("2026-12-01T00:00:01Z"),
    );
    expect(state.sent).toHaveLength(2);
  });

  it("frees the claim when the email didn't go out, so the next write retries", async () => {
    state.sendResult = { sent: false, reason: "failed" };
    expect(
      await sendLimitNotice(scope, "storage", { used: 49, limit: 50 }, NOW),
    ).toEqual({ sent: null, reason: "failed" });
    expect(fakeDb.rows("limitNotice")).toHaveLength(0);
    state.sendResult = { sent: true, id: "em_2" };
    expect(
      await sendLimitNotice(scope, "storage", { used: 49, limit: 50 }, NOW),
    ).toEqual({ sent: 90 });
  });

  it("sends AI art counted per person to that person, not the owners", async () => {
    await sendLimitNotice(
      scope,
      "aiArt",
      { used: 3, limit: 3, pooled: false },
      NOW,
    );
    expect(state.sent[0]?.to).toEqual(["bob@example.com"]);
    expect(fakeDb.rows("limitNotice")[0]).toMatchObject({ subject: "u_bob" });
    // A pooled allowance is the workspace's.
    await sendLimitNotice(
      scope,
      "aiArt",
      { used: 150, limit: 150, pooled: true },
      NOW,
    );
    expect(state.sent[1]?.to.sort()).toEqual([
      "alice@example.com",
      "carol@example.com",
    ]);
  });

  it("sends nothing and doesn't fail before the limit_notice table exists", async () => {
    const missing = Object.assign(new Error("Failed query"), {
      cause: Object.assign(
        new Error('relation "limit_notice" does not exist'),
        {
          code: "42P01",
        },
      ),
    });
    const database = repoDatabase.database as { insert: () => unknown };
    const spy = vi.spyOn(database, "insert").mockImplementation(() => {
      throw missing;
    });
    try {
      expect(
        await sendLimitNotice(
          scope,
          "dynamicCodes",
          { used: 10, limit: 10 },
          NOW,
        ),
      ).toEqual({ sent: null, reason: "unavailable" });
      expect(state.sent).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("noteLimitUsage", () => {
  it("never touches the database where email can't go out (dev, previews)", async () => {
    state.deliveryAllowed = false;
    expect(limitNoticesCanSend()).toBe(false);
    const database = repoDatabase.database as { select: () => unknown };
    const select = vi.spyOn(database, "select");
    noteLimitUsage(scope, "dynamicCodes", { used: 10, limit: 10 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(select).not.toHaveBeenCalled();
    expect(state.sent).toHaveLength(0);
    select.mockRestore();

    state.deliveryAllowed = true;
    state.emailOn = false;
    expect(limitNoticesCanSend()).toBe(false);
  });

  it("runs in the background and never throws", async () => {
    noteLimitUsage(scope, "dynamicCodes", { used: 10, limit: 10 });
    noteLimitUsage(scope, "dynamicCodes", { used: 3, limit: null });
    await vi.waitFor(() => expect(state.sent).toHaveLength(1));
  });
});
