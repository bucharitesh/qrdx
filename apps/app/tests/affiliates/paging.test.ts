// The affiliate pages read sums, not every row: /admin/affiliates pages its
// three lists and gets each affiliate's sign-ups, paying customers and
// pending / payable / paid money from SQL aggregates; the admin's affiliate
// page and Settings → Affiliate program page the commissions table (25 a
// page, newest payment first) while their totals still cover every
// commission. Checked here against what the pages computed before, row by
// row in JavaScript (totalsOf over every commission), on the in-memory
// database.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

import {
  type CommissionView,
  listAffiliatesForAdmin,
  loadAffiliateDashboard,
  loadAffiliateForAdmin,
  type MoneyTotals,
  totalsOf,
} from "@/lib/affiliates/program";
import { effectiveCommissionStatus } from "@/lib/affiliates/rules";
import { PAGE_SIZE } from "@/lib/paging";
import { fakeDb, type Row } from "../support/fake-db";
import { createRandom } from "../support/prng";
import { AFFILIATE_USER, resetAffiliateDb } from "./seed";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00Z");
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);

function seedUser(id: string) {
  fakeDb.seed("user", [
    {
      id,
      email: `${id}@example.com`,
      name: id,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
}

function seedAffiliateRow(
  id: string,
  status: string,
  createdAt: Date,
  userId = `user_${id}`,
) {
  fakeDb.seed("affiliate", [
    {
      id,
      userId,
      status,
      code: `code-${id}`,
      previousCode: null,
      codeChangedAt: null,
      paypalEmail: status === "approved" ? `${id}@paypal.example` : null,
      paypalEmailChangedAt: null,
      application: { website: "", promotion: "A newsletter" },
      clickCount: 3,
      approvedAt: status === "pending" ? null : createdAt,
      approvedBy: null,
      reviewedAt: null,
      reviewedBy: null,
      statusNote: status === "rejected" ? "Not a fit" : null,
      createdAt,
      updatedAt: createdAt,
    },
  ]);
}

let commissionSeq = 0;
function seedCommission(
  affiliateId: string,
  overrides: Partial<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    orderPaidAt: Date;
    availableAt: Date;
    payoutId: string | null;
    voidReason: string | null;
  }> = {},
) {
  const n = commissionSeq++;
  const orderPaidAt = overrides.orderPaidAt ?? daysFromNow(-40);
  fakeDb.seed("affiliateCommission", [
    {
      id: `com_${String(n).padStart(4, "0")}`,
      affiliateId,
      referralId: null,
      referredUserId: null,
      polarOrderId: `order_${n}`,
      currency: "usd",
      orderAmount: 5000,
      rateBps: 3000,
      amount: 1500,
      status: "pending",
      orderPaidAt,
      availableAt: new Date(orderPaidAt.getTime() + 30 * DAY),
      voidedAt: null,
      voidReason: null,
      voidRefundId: null,
      payoutId: null,
      createdAt: orderPaidAt,
      updatedAt: orderPaidAt,
      ...overrides,
    },
  ]);
}

let referralSeq = 0;
function seedReferralRow(affiliateId: string, firstPaidAt: Date | null) {
  const n = referralSeq++;
  fakeDb.seed("affiliateReferral", [
    {
      id: `ref_${n}`,
      affiliateId,
      referredUserId: `customer_${n}`,
      attributedVia: "link",
      firstPaidAt,
      createdAt: NOW,
    },
  ]);
}

/** What the admin list showed for an affiliate before: every row, in JS. */
function figuresTheOldWay(affiliateId: string): {
  signUps: number;
  payingCustomers: number;
  totals: MoneyTotals;
} {
  const own = (table: string) =>
    fakeDb.rows(table).filter((row) => row.affiliateId === affiliateId);
  const referrals = own("affiliateReferral");
  return {
    signUps: referrals.length,
    payingCustomers: referrals.filter((row) => row.firstPaidAt).length,
    totals: totalsOf(
      own("affiliateCommission") as unknown as Parameters<typeof totalsOf>[0],
      NOW,
    ),
  };
}

/**
 * Commissions in every state the pages tell apart: on hold, past the hold
 * (payable), approved but already in a payout, paid, void, at exactly the
 * end of the hold, zero amounts, and currencies in either case.
 */
function seedRandomCommissions(affiliateId: string, seed: number) {
  const random = createRandom(seed);
  const count = random.int(0, 14);
  for (let i = 0; i < count; i++) {
    const status = random.pick(["pending", "approved", "void", "paid"]);
    seedCommission(affiliateId, {
      amount: random.pick([0, 1, 450, 1500, 2999]),
      currency: random.pick(["usd", "USD", "eur", "inr"]),
      status,
      orderPaidAt: daysFromNow(-random.int(0, 90)),
      availableAt: random.pick([
        NOW,
        daysFromNow(-random.int(1, 60)),
        daysFromNow(random.int(1, 30)),
      ]),
      payoutId:
        status === "paid" || (status === "approved" && random.bool())
          ? `payout_${random.int(1, 3)}`
          : null,
      voidReason: status === "void" ? "refund" : null,
    });
  }
  for (let i = random.int(0, 5); i > 0; i--) {
    seedReferralRow(affiliateId, random.bool() ? daysFromNow(-3) : null);
  }
}

const newestFirst = (rows: Row[]) =>
  [...rows]
    .sort(
      (a, b) =>
        (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime() ||
        String(b.id).localeCompare(String(a.id)),
    )
    .map((row) => row.id as string);

beforeEach(() => {
  resetAffiliateDb();
  commissionSeq = 0;
  referralSeq = 0;
});

describe("/admin/affiliates", () => {
  // 33 approved or suspended (two pages), 27 applications (two pages), 3
  // rejected, and one approved affiliate whose account is gone.
  function seedProgram() {
    const statuses = [
      ...Array.from({ length: 33 }, (_, i) =>
        i % 5 === 0 ? "suspended" : "approved",
      ),
      ...Array.from({ length: 27 }, () => "pending"),
      ...Array.from({ length: 3 }, () => "rejected"),
    ];
    statuses.forEach((status, i) => {
      const id = `aff_${String(i).padStart(2, "0")}`;
      seedUser(`user_${id}`);
      // Every third one applied at the same moment as another.
      seedAffiliateRow(id, status, daysFromNow(-100 + (i - (i % 3))));
      seedRandomCommissions(id, 1000 + i);
    });
    seedAffiliateRow("aff_orphan", "approved", NOW, "user_gone");
    seedCommission("aff_orphan", { availableAt: daysFromNow(-1) });
    seedReferralRow("aff_orphan", NOW);
  }

  const listed = () =>
    fakeDb
      .rows("affiliate")
      .filter((row) => fakeDb.find("user", { id: row.userId }));

  it("shows each affiliate's figures exactly as adding up every row did", async () => {
    seedProgram();
    const seen: string[] = [];
    for (const page of [1, 2]) {
      const loaded = await listAffiliatesForAdmin(NOW, { affiliates: page });
      if (!loaded.ready) throw new Error("not ready");
      const { affiliates } = loaded.value;
      expect(affiliates.total).toBe(33);
      expect(affiliates.page).toBe(page);
      for (const row of affiliates.rows) {
        seen.push(row.id);
        expect(
          {
            signUps: row.signUps,
            payingCustomers: row.payingCustomers,
            totals: row.totals,
          },
          row.id,
        ).toEqual(figuresTheOldWay(row.id));
      }
    }
    const active = listed().filter(
      (row) => row.status === "approved" || row.status === "suspended",
    );
    expect(seen).toEqual(newestFirst(active));
    // Some affiliate has money in every bucket, so the comparison means something.
    const everyBucket = active.some((row) => {
      const { totals } = figuresTheOldWay(row.id as string);
      return Object.values(totals).every(
        (bucket) => Object.keys(bucket).length > 0,
      );
    });
    expect(everyBucket).toBe(true);
  });

  it("counts the cards over everyone listed, as before", async () => {
    seedProgram();
    const loaded = await listAffiliatesForAdmin(NOW);
    if (!loaded.ready) throw new Error("not ready");
    const rows = listed();
    const active = rows.filter(
      (row) => row.status === "approved" || row.status === "suspended",
    );
    expect(loaded.value.stats).toEqual({
      applications: rows.filter((row) => row.status === "pending").length,
      approved: rows.filter((row) => row.status === "approved").length,
      withPayableBalance: active.filter(
        (row) =>
          Object.keys(figuresTheOldWay(row.id as string).totals.payable)
            .length > 0,
      ).length,
      signUps: rows.reduce(
        (sum, row) => sum + figuresTheOldWay(row.id as string).signUps,
        0,
      ),
    });
    expect(loaded.value.stats.applications).toBe(27);
    expect(loaded.value.stats.withPayableBalance).toBeGreaterThan(0);
  });

  it("pages applications and rejected on their own, newest first", async () => {
    seedProgram();
    const pending = newestFirst(
      listed().filter((row) => row.status === "pending"),
    );
    const first = await listAffiliatesForAdmin(NOW, { applications: 1 });
    const second = await listAffiliatesForAdmin(NOW, {
      applications: 2,
      rejected: 1,
    });
    if (!(first.ready && second.ready)) throw new Error("not ready");
    expect(first.value.applications.rows).toHaveLength(PAGE_SIZE);
    expect(second.value.applications.page).toBe(2);
    expect(
      [...first.value.applications.rows, ...second.value.applications.rows].map(
        (row) => row.id,
      ),
    ).toEqual(pending);
    expect(second.value.rejected).toMatchObject({ total: 3, page: 1 });
    expect(second.value.rejected.rows.map((row) => row.statusNote)).toEqual([
      "Not a fit",
      "Not a fit",
      "Not a fit",
    ]);
  });

  it("shows the last page for a page past the end", async () => {
    seedProgram();
    const loaded = await listAffiliatesForAdmin(NOW, {
      affiliates: 40,
      applications: 9,
      rejected: 5,
    });
    if (!loaded.ready) throw new Error("not ready");
    const { affiliates, applications, rejected } = loaded.value;
    expect(affiliates.page).toBe(2);
    expect(affiliates.rows).toHaveLength(8);
    expect(applications.page).toBe(2);
    expect(applications.rows).toHaveLength(2);
    expect(rejected.page).toBe(1);
    expect(rejected.rows).toHaveLength(3);
  });

  it("is empty, on page 1, with no affiliates at all", async () => {
    const loaded = await listAffiliatesForAdmin(NOW, { affiliates: 3 });
    expect(loaded).toEqual({
      ready: true,
      value: {
        stats: {
          applications: 0,
          approved: 0,
          withPayableBalance: 0,
          signUps: 0,
        },
        applications: { rows: [], total: 0, page: 1 },
        affiliates: { rows: [], total: 0, page: 1 },
        rejected: { rows: [], total: 0, page: 1 },
      },
    });
  });
});

describe("an affiliate's commissions", () => {
  // 60 commissions; payments made at the same moment come in pairs.
  function seedSixty() {
    seedUser("user_aff_big");
    seedAffiliateRow("aff_big", "approved", daysFromNow(-200));
    for (let i = 0; i < 60; i++) {
      seedCommission("aff_big", {
        orderPaidAt: daysFromNow(-Math.floor(i / 2)),
        status: ["pending", "approved", "paid", "void"][i % 4] as string,
        availableAt: daysFromNow(15 - Math.floor(i / 2)),
        payoutId: i % 4 === 2 ? "payout_1" : null,
        currency: i % 3 === 0 ? "eur" : "usd",
        amount: 100 + i,
      });
    }
  }

  /** All of them in the table's order: newest payment, then highest id. */
  const inOrder = () =>
    [...fakeDb.rows("affiliateCommission")]
      .filter((row) => row.affiliateId === "aff_big")
      .sort(
        (a, b) =>
          (b.orderPaidAt as Date).getTime() -
            (a.orderPaidAt as Date).getTime() ||
          String(b.id).localeCompare(String(a.id)),
      );

  const ids = (rows: CommissionView[]) => rows.map((row) => row.id);

  it("pages them 25 at a time: first, middle and last page", async () => {
    seedSixty();
    const all = inOrder().map((row) => row.id);
    const pages = [];
    for (const page of [1, 2, 3]) {
      const loaded = await loadAffiliateForAdmin("aff_big", NOW, { page });
      if (!(loaded.ready && loaded.value)) throw new Error("no affiliate");
      pages.push(loaded.value.commissions);
    }
    expect(pages.map((page) => [page.page, page.total])).toEqual([
      [1, 60],
      [2, 60],
      [3, 60],
    ]);
    expect(ids(pages[0]?.rows ?? [])).toEqual(all.slice(0, 25));
    expect(ids(pages[1]?.rows ?? [])).toEqual(all.slice(25, 50));
    expect(ids(pages[2]?.rows ?? [])).toEqual(all.slice(50));
    // Each shows the status a person sees.
    for (const row of pages.flatMap((page) => page.rows)) {
      const stored = fakeDb.find("affiliateCommission", { id: row.id });
      expect(row.status).toBe(
        effectiveCommissionStatus(
          stored as { status: string; availableAt: Date; payoutId: string },
          NOW,
        ),
      );
    }
  });

  it("shows the last page for a page past the end", async () => {
    seedSixty();
    const loaded = await loadAffiliateForAdmin("aff_big", NOW, { page: 99 });
    if (!(loaded.ready && loaded.value)) throw new Error("no affiliate");
    expect(loaded.value.commissions.page).toBe(3);
    expect(ids(loaded.value.commissions.rows)).toEqual(
      inOrder()
        .slice(50)
        .map((row) => row.id),
    );
  });

  it("totals cover every commission, not only the page", async () => {
    seedSixty();
    seedReferralRow("aff_big", NOW);
    seedReferralRow("aff_big", null);
    const loaded = await loadAffiliateForAdmin("aff_big", NOW, { page: 2 });
    if (!(loaded.ready && loaded.value)) throw new Error("no affiliate");
    const { affiliate } = loaded.value;
    expect({
      signUps: affiliate.signUps,
      payingCustomers: affiliate.payingCustomers,
      totals: affiliate.totals,
    }).toEqual(figuresTheOldWay("aff_big"));
    // Every fourth is paid: 15 of them, 5 in euros, all on pages 1 to 3.
    expect(affiliate.totals.paid).toEqual({ eur: 650, usd: 1300 });
  });

  it("an affiliate without any is on page 1 of nothing", async () => {
    seedUser("user_aff_new");
    seedAffiliateRow("aff_new", "approved", NOW);
    const loaded = await loadAffiliateForAdmin("aff_new", NOW, { page: 4 });
    if (!(loaded.ready && loaded.value)) throw new Error("no affiliate");
    expect(loaded.value.commissions).toEqual({ rows: [], total: 0, page: 1 });
    expect(loaded.value.affiliate.totals).toEqual({
      pending: {},
      payable: {},
      paid: {},
    });
  });

  it("Settings → Affiliate program pages them the same way, totals from all", async () => {
    seedAffiliateRow("aff_mine", "approved", NOW, AFFILIATE_USER.id);
    for (let i = 0; i < 30; i++) {
      seedCommission("aff_mine", {
        orderPaidAt: daysFromNow(-i),
        availableAt: daysFromNow(30 - i * 2),
        amount: 1000 + i,
      });
    }
    const first = await loadAffiliateDashboard(AFFILIATE_USER.id, NOW);
    const second = await loadAffiliateDashboard(AFFILIATE_USER.id, NOW, {
      page: 2,
    });
    if (!(first.ready && second.ready)) throw new Error("not ready");
    expect(first.value.commissions).toMatchObject({ page: 1, total: 30 });
    expect(first.value.commissions.rows).toHaveLength(25);
    expect(second.value.commissions).toMatchObject({ page: 2, total: 30 });
    expect(second.value.commissions.rows).toHaveLength(5);
    expect(
      new Set(
        [...first.value.commissions.rows, ...second.value.commissions.rows].map(
          (row) => row.id,
        ),
      ).size,
    ).toBe(30);
    for (const loaded of [first, second]) {
      expect(loaded.value.totals).toEqual(figuresTheOldWay("aff_mine").totals);
    }
    expect(first.value.totals.payable.usd).toBeGreaterThan(0);
    expect(first.value.totals.pending.usd).toBeGreaterThan(0);
  });

  it("Settings shows nothing to page before the application is approved", async () => {
    seedAffiliateRow("aff_mine", "pending", NOW, AFFILIATE_USER.id);
    seedCommission("aff_mine");
    const loaded = await loadAffiliateDashboard(AFFILIATE_USER.id, NOW, {
      page: 3,
    });
    if (!loaded.ready) throw new Error("not ready");
    expect(loaded.value.commissions).toEqual({ rows: [], total: 0, page: 1 });
  });
});
