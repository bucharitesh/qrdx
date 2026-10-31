// Run: cd apps/docs && npx tsx --test lib/landing/blocks/form-fields.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectAppPlatform, hostIn, orderAppLinks } from "./apps-platform";
import {
  barcodeError,
  code128Values,
  ean13CheckDigit,
  encodeCode128,
  encodeEan13,
  normalizeEan13,
} from "./coupon-barcode";
import { couponStatus } from "./coupon-schema";
import {
  type FormField,
  formatAnswerValue,
  formFieldsSchema,
  validateAnswers,
} from "./form-fields";

const fields: FormField[] = formFieldsSchema.parse([
  { id: "name", type: "text", label: "Name", required: true, maxLength: 20 },
  { id: "email", type: "email", label: "Email" },
  { id: "phone", type: "phone", label: "Phone" },
  { id: "stars", type: "stars", label: "Rating", required: true },
  { id: "nps", type: "nps", label: "Recommend?" },
  { id: "pick", type: "choice", label: "Pick", options: ["A", "B"] },
  {
    id: "many",
    type: "choice",
    label: "Many",
    multiple: true,
    options: ["X", "Y", "Z"],
  },
  { id: "ok", type: "consent", label: "I agree", required: true },
]);

describe("form fields", () => {
  it("rejects duplicate field ids and options", () => {
    assert.equal(
      formFieldsSchema.safeParse([
        { id: "a", type: "email", label: "One" },
        { id: "a", type: "phone", label: "Two" },
      ]).success,
      false,
    );
    assert.equal(
      formFieldsSchema.safeParse([
        { id: "a", type: "choice", label: "One", options: ["Same", "Same"] },
      ]).success,
      false,
    );
  });

  it("accepts valid answers, normalizes them and drops blanks", () => {
    const result = validateAnswers(fields, {
      name: "  Ada  ",
      email: "ADA@Example.com",
      phone: "",
      stars: 4,
      nps: 0,
      pick: "B",
      many: ["Z", "X"],
      ok: true,
      extra: "ignored",
    });
    assert.ok(result.success);
    if (!result.success) return;
    const byId = Object.fromEntries(result.answers.map((a) => [a.id, a.value]));
    assert.deepEqual(byId, {
      name: "Ada",
      email: "ada@example.com",
      stars: 4,
      nps: 0,
      pick: "B",
      many: ["X", "Z"],
      ok: true,
    });
    assert.equal(result.answers[0]?.label, "Name");
  });

  it("reports one error per invalid field", () => {
    const result = validateAnswers(fields, {
      name: "x".repeat(21),
      email: "not-an-email",
      phone: "abc",
      stars: 6,
      nps: 11,
      pick: "C",
      many: ["X", "Nope"],
      ok: false,
    });
    assert.ok(!result.success);
    if (result.success) return;
    assert.deepEqual(Object.keys(result.errors).sort(), [
      "email",
      "many",
      "name",
      "nps",
      "ok",
      "phone",
      "pick",
      "stars",
    ]);
  });

  it("requires required fields", () => {
    const result = validateAnswers(fields, {});
    assert.ok(!result.success);
    if (result.success) return;
    assert.deepEqual(Object.keys(result.errors).sort(), [
      "name",
      "ok",
      "stars",
    ]);
  });

  it("formats answers as text", () => {
    assert.equal(
      formatAnswerValue({ type: "choice", value: ["A", "B"] }),
      "A, B",
    );
    assert.equal(formatAnswerValue({ type: "consent", value: true }), "Yes");
    assert.equal(formatAnswerValue({ type: "stars", value: 5 }), "5 ★");
    assert.equal(formatAnswerValue({ type: "nps", value: 9 }), "9");
  });
});

describe("barcodes", () => {
  it("computes EAN-13 check digits", () => {
    assert.equal(ean13CheckDigit("400638133393"), 1);
    assert.equal(normalizeEan13("4006381333931"), "4006381333931");
    assert.equal(normalizeEan13("400638133393"), "4006381333931");
    assert.equal(normalizeEan13("4006381333932"), null);
    assert.equal(normalizeEan13("12345"), null);
    assert.equal(encodeEan13("4006381333931").length, 95);
  });

  it("encodes Code 128 with set C for digit runs and a valid checksum", () => {
    // "12345678": start C, 12 34 56 78, checksum
    const values = code128Values("12345678");
    assert.equal(values[0], 105);
    assert.deepEqual(values.slice(1, 5), [12, 34, 56, 78]);
    const sum = 105 + 12 * 1 + 34 * 2 + 56 * 3 + 78 * 4;
    assert.equal(values[5], sum % 103);
    // Every symbol is 11 modules, the stop 13; starts and ends with a bar.
    const modules = encodeCode128("SAVE20");
    assert.equal(modules.length, code128Values("SAVE20").length * 11 + 13);
    assert.equal(modules[0], true);
    assert.equal(modules.at(-1), true);
  });

  it("explains values a format can't encode", () => {
    assert.equal(barcodeError("code128", "SAVE20"), null);
    assert.ok(barcodeError("code128", "café"));
    assert.ok(barcodeError("ean13", "SAVE20"));
  });
});

describe("coupon validity", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it("is valid inside its dates (inclusive, any time zone)", () => {
    assert.equal(
      couponStatus({ validFrom: "", validUntil: "" }, now).state,
      "valid",
    );
    assert.equal(
      couponStatus({ validFrom: "2026-06-01", validUntil: "2026-06-15" }, now)
        .state,
      "valid",
    );
  });
  it("is upcoming before and expired after", () => {
    assert.equal(
      couponStatus({ validFrom: "2026-06-17", validUntil: "" }, now).state,
      "upcoming",
    );
    assert.equal(
      couponStatus({ validFrom: "", validUntil: "2026-06-13" }, now).state,
      "expired",
    );
    // June 14 has ended everywhere only at June 15 12:00 UTC.
    assert.equal(
      couponStatus(
        { validFrom: "", validUntil: "2026-06-14" },
        new Date("2026-06-15T11:00:00Z"),
      ).state,
      "valid",
    );
  });
});

describe("app links", () => {
  const links = [
    {
      kind: "ios" as const,
      href: "https://apps.apple.com/app/id1",
      label: "iOS",
    },
    {
      kind: "android" as const,
      href: "https://play.google.com/x",
      label: "Play",
    },
    { kind: "web" as const, href: "https://example.com", label: "Web" },
  ];
  it("detects platforms from user agents", () => {
    assert.equal(
      detectAppPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
      "ios",
    );
    assert.equal(
      detectAppPlatform(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130.0",
      ),
      "android",
    );
    assert.equal(detectAppPlatform("Mozilla/5.0 (Windows NT 10.0)"), "other");
    assert.equal(detectAppPlatform(null), "other");
  });
  it("puts the visitor's store first, else the website", () => {
    assert.equal(orderAppLinks(links, "ios")[0]?.kind, "ios");
    assert.equal(orderAppLinks(links, "android")[0]?.kind, "android");
    assert.equal(orderAppLinks(links, "other")[0]?.kind, "web");
    assert.equal(orderAppLinks(links.slice(0, 1), "android")[0]?.kind, "ios");
    assert.equal(orderAppLinks(links, "ios").length, 3);
  });
  it("matches store hosts and their subdomains only", () => {
    assert.equal(
      hostIn("https://apps.apple.com/us/app/x", ["apps.apple.com"]),
      true,
    );
    assert.equal(
      hostIn("https://apps.apple.com.evil.test/x", ["apps.apple.com"]),
      false,
    );
  });
});
