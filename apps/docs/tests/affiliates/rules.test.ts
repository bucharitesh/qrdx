// The affiliate program's maths and rules (lib/affiliates/rules.ts): 30%,
// the 12-month window, the 30-day hold, the payout minimums, and the email
// normalisation behind the self-referral check. Pure: no database.
import { describe, expect, it } from "vitest";
import {
  addMonthsUtc,
  availableAtFor,
  canonicalEmail,
  chargedNetAmount,
  checkChosenCode,
  commissionBase,
  commissionFor,
  commissionWindowEnd,
  currencyEntries,
  effectiveCommissionStatus,
  isPayable,
  isSameCanonicalEmail,
  isWithinCommissionWindow,
  meetsMinimumPayout,
  parseReferralCode,
  payableUsdTotal,
  REFERRAL_CODE_ALPHABET,
  RESERVED_REFERRAL_CODES,
  randomReferralCode,
  refundVoids,
  toUsdCents,
} from "@/lib/affiliates/rules";
import {
  AFFILIATE_COMMISSION_BPS,
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_COMMISSION_PERCENT,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT_LABEL,
  AFFILIATE_MIN_PAYOUT_USD,
  AFFILIATE_RANDOM_CODE_LENGTH,
  EXAMPLE_REFERRAL_CODE,
  formatMinorAmount,
} from "@/lib/affiliates/terms";

const DAY = 24 * 60 * 60 * 1000;

describe("the owner's numbers", () => {
  it("are 30%, 12 months, 30 days and US$25", () => {
    expect(AFFILIATE_COMMISSION_BPS).toBe(3000);
    expect(AFFILIATE_COMMISSION_PERCENT).toBe(30);
    expect(AFFILIATE_COMMISSION_MONTHS).toBe(12);
    expect(AFFILIATE_HOLD_DAYS).toBe(30);
    expect(AFFILIATE_MIN_PAYOUT_USD).toBe(2500);
    expect(AFFILIATE_MIN_PAYOUT_LABEL).toBe("US$25");
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

  // B4: account credit (a positive customer balance) lowers what's charged.
  it("is capped at what the customer was charged before tax (account credit)", () => {
    // US$15 order, no tax, US$10 of credit applied: US$5 was charged.
    const credited = { net_amount: 1500, tax_amount: 0, due_amount: 500 };
    expect(chargedNetAmount(credited)).toBe(500);
    expect(commissionBase({ ...credited, refunded_amount: 0 })).toBe(500);
    expect(commissionFor(commissionBase(credited))).toBe(150);
    // With tax: ₹199 + 18% GST = ₹234.82, ₹100 of credit → ₹134.82 due,
    // of which ₹35.82 is tax: ₹99 charged before tax.
    expect(
      chargedNetAmount({
        net_amount: 19_900,
        tax_amount: 3_582,
        due_amount: 13_482,
      }),
    ).toBe(9_900);
    // Paid entirely with credit: nothing charged.
    expect(
      chargedNetAmount({ net_amount: 1500, tax_amount: 0, due_amount: 0 }),
    ).toBe(0);
    // A negative balance (owed from before) raises what's due, never the base.
    expect(
      chargedNetAmount({ net_amount: 1500, tax_amount: 0, due_amount: 2500 }),
    ).toBe(1500);
    // No due_amount in the payload: not capped.
    expect(chargedNetAmount({ net_amount: 1500 })).toBe(1500);
  });
});

describe("the 12-month window", () => {
  const first = new Date("2026-01-31T10:00:00Z");

  it("adds calendar months in UTC, clamping to the month's last day", () => {
    expect(addMonthsUtc(first, 1).toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    // A day before the anniversary.
    expect(commissionWindowEnd(first).toISOString()).toBe(
      "2027-01-30T10:00:00.000Z",
    );
  });

  it("includes the first payment and everything up to a day before the anniversary", () => {
    expect(isWithinCommissionWindow(first, first)).toBe(true);
    expect(
      isWithinCommissionWindow(first, new Date("2027-01-30T09:59:59Z")),
    ).toBe(true);
  });

  // B1: a yearly renewal (or the 13th monthly payment) is charged on the
  // anniversary; its webhook can arrive a little before or after it.
  it("excludes a renewal seconds before or after the anniversary", () => {
    const anniversary = new Date("2027-01-31T10:00:00Z").getTime();
    for (const offset of [-60_000, -5_000, -1, 0, 1, 5_000, 60_000]) {
      expect(
        isWithinCommissionWindow(first, new Date(anniversary + offset)),
      ).toBe(false);
    }
    // Even an early charge up to a day before.
    expect(
      isWithinCommissionWindow(first, new Date(anniversary - DAY + 1)),
    ).toBe(false);
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

describe("the payout minimum (one, in US dollars)", () => {
  it("is US$25 for everything payable together", () => {
    expect(meetsMinimumPayout(2499)).toBe(false);
    expect(meetsMinimumPayout(2500)).toBe(true);
    expect(meetsMinimumPayout(Number.NaN)).toBe(false);
  });

  it("formats amounts as copy writes them", () => {
    expect(formatMinorAmount(2500, "usd")).toBe("US$25");
    expect(formatMinorAmount(150, "usd")).toBe("US$1.50");
    expect(formatMinorAmount(5970, "inr")).toBe("₹59.70");
  });
});

describe("US-dollar conversion", () => {
  it("converts minor units at US dollars per unit, rounding down", () => {
    // ₹1,499.70 at 0.0113636 US$ per rupee = US$17.0420... → 1704 cents.
    expect(toUsdCents(149_970, "0.0113636")).toBe(1704);
    expect(toUsdCents(100, "1")).toBe(100);
  });

  it("refuses something that isn't a rate", () => {
    for (const bad of ["", "0", "-1", "abc", "NaN", "Infinity"]) {
      expect(() => toUsdCents(100, bad)).toThrow("Not an exchange rate");
    }
  });

  // D-C2: US$20 + ₹2,000 pays out together once converted.
  it("adds US dollars and converted currencies into one total", () => {
    expect(
      payableUsdTotal({ usd: 2000, inr: 200_000 }, { inr: "0.0113636" }),
    ).toBe(2000 + 2272);
    expect(meetsMinimumPayout(2000 + 2272)).toBe(true);
    expect(payableUsdTotal({ usd: 2000 }, {})).toBe(2000);
    expect(payableUsdTotal({ usd: 2000, inr: 0 }, {})).toBe(2000);
  });

  it("never guesses: no rate for a currency means no total", () => {
    expect(payableUsdTotal({ usd: 2000, inr: 200_000 }, {})).toBeNull();
    expect(payableUsdTotal({ eur: 3000 }, { inr: "0.0113636" })).toBeNull();
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

  // D-C3: codes start random, never from a name or an email address.
  it("starts random, from letters and digits that can't be confused", () => {
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[ilo01]/);
    const codes = new Set(
      Array.from({ length: 200 }, () => randomReferralCode()),
    );
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toHaveLength(AFFILIATE_RANDOM_CODE_LENGTH);
      expect(parseReferralCode(code)).toBe(code);
      expect(code).toMatch(new RegExp(`^[${REFERRAL_CODE_ALPHABET}]+$`));
    }
    // From the random bytes alone.
    expect(randomReferralCode(() => new Uint8Array(8))).toBe("aaaaaaaa");
    expect(parseReferralCode(EXAMPLE_REFERRAL_CODE)).toBe(
      EXAMPLE_REFERRAL_CODE,
    );
    expect(EXAMPLE_REFERRAL_CODE).toHaveLength(AFFILIATE_RANDOM_CODE_LENGTH);
  });

  it("lets an affiliate choose a code with the slug rules", () => {
    expect(checkChosenCode("Ana-Picks")).toEqual({
      ok: true,
      code: "ana-picks",
    });
    expect(checkChosenCode("a")).toEqual({ ok: false, problem: "format" });
    expect(checkChosenCode("ana--picks")).toEqual({
      ok: false,
      problem: "format",
    });
    expect(checkChosenCode("ana@x")).toEqual({ ok: false, problem: "format" });
  });

  it("blocks reserved words and anything passing for QRdx", () => {
    for (const word of [
      "admin",
      "api",
      "affiliates",
      "partner",
      "qrdx",
      "qrdx-team",
      "qrdxdeals",
      "paypal",
    ]) {
      expect(checkChosenCode(word)).toEqual({ ok: false, problem: "reserved" });
    }
    expect(RESERVED_REFERRAL_CODES.has("dashboard")).toBe(true);
  });

  it("refuses the local part of the affiliate's own email address, in any spelling", () => {
    const emails = ["Ana.Diaz+promo@gmail.com"];
    for (const code of [
      "ana-diaz",
      "anadiaz",
      "ana-diaz-promo",
      "anadiazpromo",
    ]) {
      expect(checkChosenCode(code, emails)).toEqual({
        ok: false,
        problem: "email",
      });
    }
    expect(checkChosenCode("ana-diaz-qr", emails)).toEqual({
      ok: true,
      code: "ana-diaz-qr",
    });
    expect(checkChosenCode("ana-diaz")).toEqual({ ok: true, code: "ana-diaz" });
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
