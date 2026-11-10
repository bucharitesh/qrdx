// The affiliate program's maths and rules (lib/affiliates/rules.ts): 30%,
// the 12-month window, the 30-day hold, the payout minimums, and the email
// normalisation behind the self-referral check. Pure: no database.
import { describe, expect, it } from "vitest";
import {
  addMonthsUtc,
  availableAtFor,
  canonicalEmail,
  commissionBase,
  commissionFor,
  commissionWindowEnd,
  currencyEntries,
  effectiveCommissionStatus,
  isPayable,
  isSameCanonicalEmail,
  isWithinCommissionWindow,
  meetsMinimumPayout,
  minimumPayout,
  parseReferralCode,
  referralCodeStem,
  refundVoids,
} from "@/lib/affiliates/rules";
import {
  AFFILIATE_COMMISSION_BPS,
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_COMMISSION_PERCENT,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT,
  AFFILIATE_MIN_PAYOUT_INR_LABEL,
  AFFILIATE_MIN_PAYOUT_USD_LABEL,
  formatMinorAmount,
} from "@/lib/affiliates/terms";

const DAY = 24 * 60 * 60 * 1000;

describe("the owner's numbers", () => {
  it("are 30%, 12 months, 30 days and US$25", () => {
    expect(AFFILIATE_COMMISSION_BPS).toBe(3000);
    expect(AFFILIATE_COMMISSION_PERCENT).toBe(30);
    expect(AFFILIATE_COMMISSION_MONTHS).toBe(12);
    expect(AFFILIATE_HOLD_DAYS).toBe(30);
    expect(AFFILIATE_MIN_PAYOUT.usd).toBe(2500);
    expect(AFFILIATE_MIN_PAYOUT_USD_LABEL).toBe("US$25");
    expect(AFFILIATE_MIN_PAYOUT_INR_LABEL).toBe("₹2,200");
  });
});

describe("commission maths", () => {
  it("is 30% of the amount, in minor units", () => {
    expect(commissionFor(500)).toBe(150); // US$5 Pro month → US$1.50
    expect(commissionFor(14_400)).toBe(4_320); // US$144 Business year
    expect(commissionFor(19_900)).toBe(5_970); // ₹199 Pro month
  });

  it("rounds down to a whole minor unit", () => {
    expect(commissionFor(333)).toBe(99); // 99.9
    expect(commissionFor(1)).toBe(0);
  });

  it("is nothing for nothing", () => {
    expect(commissionFor(0)).toBe(0);
    expect(commissionFor(-500)).toBe(0);
    expect(commissionFor(Number.NaN)).toBe(0);
  });

  it("is based on net_amount less refunded_amount (both before tax)", () => {
    expect(commissionBase({ net_amount: 1500, refunded_amount: 0 })).toBe(1500);
    expect(commissionBase({ net_amount: 1500, refunded_amount: 500 })).toBe(
      1000,
    );
    expect(commissionBase({ net_amount: 1500, refunded_amount: 2000 })).toBe(0);
    expect(commissionBase({ net_amount: 1500 })).toBe(1500);
  });
});

describe("the 12-month window", () => {
  const first = new Date("2026-01-31T10:00:00Z");

  it("adds calendar months in UTC, clamping to the month's last day", () => {
    expect(addMonthsUtc(first, 1).toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(commissionWindowEnd(first).toISOString()).toBe(
      "2027-01-31T10:00:00.000Z",
    );
  });

  it("includes the first payment and everything before 12 months", () => {
    expect(isWithinCommissionWindow(first, first)).toBe(true);
    expect(
      isWithinCommissionWindow(first, new Date("2027-01-31T09:59:59Z")),
    ).toBe(true);
  });

  it("excludes the payment exactly 12 months later and after", () => {
    expect(
      isWithinCommissionWindow(first, new Date("2027-01-31T10:00:00Z")),
    ).toBe(false);
    expect(
      isWithinCommissionWindow(first, new Date("2027-06-01T00:00:00Z")),
    ).toBe(false);
  });

  it("never counts a payment before the first one", () => {
    expect(
      isWithinCommissionWindow(first, new Date("2026-01-01T00:00:00Z")),
    ).toBe(false);
  });
});

describe("the 30-day hold", () => {
  const paidAt = new Date("2026-11-10T12:00:00Z");
  const availableAt = availableAtFor(paidAt);

  it("ends 30 days after the payment", () => {
    expect(availableAt.getTime() - paidAt.getTime()).toBe(30 * DAY);
  });

  it("is pending until then, payable after, whether or not the cron ran", () => {
    const row = { status: "pending", availableAt, payoutId: null };
    expect(
      effectiveCommissionStatus(row, new Date(availableAt.getTime() - 1)),
    ).toBe("pending");
    expect(effectiveCommissionStatus(row, availableAt)).toBe("payable");
    expect(
      effectiveCommissionStatus({ ...row, status: "approved" }, availableAt),
    ).toBe("payable");
    expect(isPayable({ ...row, payoutId: "payout_1" }, availableAt)).toBe(
      false,
    );
  });

  it("keeps paid and void as they are", () => {
    expect(
      effectiveCommissionStatus({ status: "paid", availableAt }, availableAt),
    ).toBe("paid");
    expect(
      effectiveCommissionStatus({ status: "void", availableAt }, availableAt),
    ).toBe("void");
  });

  it("lets a refund inside the hold void it, and not one after", () => {
    const row = { status: "pending", availableAt };
    expect(refundVoids(row, new Date(availableAt.getTime() - 1))).toBe(true);
    expect(refundVoids(row, availableAt)).toBe(false);
    expect(refundVoids({ status: "paid", availableAt }, paidAt)).toBe(false);
    expect(refundVoids({ status: "void", availableAt }, paidAt)).toBe(false);
  });
});

describe("payout minimums", () => {
  it("is US$25 for dollars and ₹2,200 for rupees, by Polar's currency code", () => {
    expect(minimumPayout("usd")).toBe(2500);
    expect(minimumPayout("USD")).toBe(2500);
    expect(minimumPayout("inr")).toBe(220_000);
    expect(meetsMinimumPayout(2499, "usd")).toBe(false);
    expect(meetsMinimumPayout(2500, "usd")).toBe(true);
    expect(meetsMinimumPayout(219_999, "inr")).toBe(false);
    expect(meetsMinimumPayout(220_000, "inr")).toBe(true);
  });

  it("has no minimum, so no payout, for a currency without one", () => {
    expect(minimumPayout("eur")).toBeNull();
    expect(meetsMinimumPayout(1_000_000, "eur")).toBe(false);
  });

  it("formats amounts as copy writes them", () => {
    expect(formatMinorAmount(2500, "usd")).toBe("US$25");
    expect(formatMinorAmount(150, "usd")).toBe("US$1.50");
    expect(formatMinorAmount(5970, "inr")).toBe("₹59.70");
  });
});

describe("self-referral email matching", () => {
  it("ignores case, +tags and Gmail dots", () => {
    expect(canonicalEmail(" Ana.Diaz+qrdx@GMail.com ")).toBe(
      "anadiaz@gmail.com",
    );
    expect(canonicalEmail("ana.diaz@googlemail.com")).toBe("anadiaz@gmail.com");
    expect(isSameCanonicalEmail("ana@acme.com", "ANA+promo@acme.com")).toBe(
      true,
    );
    expect(isSameCanonicalEmail("a.na@gmail.com", "ana@gmail.com")).toBe(true);
  });

  it("keeps dots outside Gmail and tells different people apart", () => {
    expect(isSameCanonicalEmail("a.na@acme.com", "ana@acme.com")).toBe(false);
    expect(isSameCanonicalEmail("ana@acme.com", "bob@acme.com")).toBe(false);
    expect(isSameCanonicalEmail("", "")).toBe(false);
    expect(isSameCanonicalEmail(null, undefined)).toBe(false);
  });
});

describe("referral codes", () => {
  it("accepts lower-case letters, digits and single hyphens, 3 to 32 long", () => {
    expect(parseReferralCode("ana-diaz-4k2p")).toBe("ana-diaz-4k2p");
    expect(parseReferralCode(" ANA-Diaz ")).toBe("ana-diaz");
    expect(parseReferralCode("ab")).toBeNull();
    expect(parseReferralCode("a".repeat(33))).toBeNull();
    expect(parseReferralCode("ana--diaz")).toBeNull();
    expect(parseReferralCode("-ana")).toBeNull();
    expect(parseReferralCode("ana-")).toBeNull();
    expect(parseReferralCode("ana_diaz")).toBeNull();
    expect(parseReferralCode("ana diaz")).toBeNull();
    expect(parseReferralCode(42)).toBeNull();
  });

  it("makes a readable stem from a name", () => {
    expect(referralCodeStem("Ana Díaz")).toBe("ana-diaz");
    expect(referralCodeStem("  ")).toBe("partner");
    expect(referralCodeStem("李")).toBe("partner");
    expect(referralCodeStem("A very long name indeed for a code")).toBe(
      "a-very-long-name-ind",
    );
  });
});

describe("amounts per currency", () => {
  it("list US dollars first, then the rest alphabetically, without zeros", () => {
    expect(
      currencyEntries({ inr: 149_970, eur: 0, usd: 4_320, gbp: 10 }),
    ).toEqual([
      ["usd", 4_320],
      ["gbp", 10],
      ["inr", 149_970],
    ]);
  });
});
