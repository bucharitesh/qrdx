// Pix, PayNow, PromptPay, VietQR (EMV) and SEPA (EPC069-12) encoders, against
// the published examples where each standard or its reference library has
// them, and the checks each form shows.
import { describe, expect, it } from "vitest";
import { pixSchema, sepaSchema } from "@/lib/validations/qr-content";
import { VIETQR_BANKS } from "@/lib/vietqr-banks";
import {
  crc16Ccitt,
  emvTemplate,
  parseEmvObjects,
  parseEmvPayload,
} from "@/utils/emv-qr";
import {
  buildEpcPayload,
  checkIban,
  EPC_MAX_BYTES,
  isBic,
  isCreditorReference,
} from "@/utils/epc-qr";
import {
  encodePayNow,
  encodePix,
  encodePromptPay,
  encodeSepa,
  encodeVietQr,
  normalizePixKey,
  payNowIssue,
  pixIssue,
  promptPayIssue,
  sepaIssue,
  vietQrIssue,
} from "@/utils/payment-qr-codes";
import { PUBLISHED } from "../support/emv-published";

/** Top-level objects, and templates as nested maps, for order-free compares. */
function tree(payload: string): Record<string, unknown> {
  const parsed = parseEmvPayload(payload);
  expect(parsed?.crcValid, payload).toBe(true);
  const out: Record<string, unknown> = {};
  for (const [id, value] of parsed?.fields ?? []) {
    if (id === "63") continue;
    const nested =
      Number(id) >= 26 && Number(id) <= 51 && parseEmvObjects(value);
    out[id] = nested ? Object.fromEntries(nested) : value;
  }
  return out;
}

describe("Pix (BR Code)", () => {
  const example = {
    type: "pix" as const,
    pixKey: "123e4567-e12b-12d1-a456-426655440000",
    name: "Fulano de Tal",
    city: "BRASILIA",
  };

  it("matches the Banco Central's static example byte for byte", () => {
    expect(encodePix(example)).toBe(PUBLISHED.pix);
  });

  it("adds an amount, a message and a transaction ID", () => {
    const payload = encodePix({
      ...example,
      amount: "10,5",
      message: "Pedido 42",
      txid: "PEDIDO42",
    });
    const fields = parseEmvPayload(payload)?.fields;
    expect(fields?.get("54")).toBe("10.50");
    expect(emvTemplate(fields?.get("26")).get("02")).toBe("Pedido 42");
    expect(emvTemplate(fields?.get("62")).get("05")).toBe("PEDIDO42");
    expect(crc16Ccitt(payload.slice(0, -4))).toBe(payload.slice(-4));
  });

  it("writes names and cities without accents", () => {
    const payload = encodePix({ ...example, city: "São Paulo" });
    expect(parseEmvPayload(payload)?.fields.get("60")).toBe("Sao Paulo");
  });

  it.each([
    ["123.456.789-09", "cpf", "12345678909"],
    ["11.222.333/0001-81", "cnpj", "11222333000181"],
    ["12.ABC.345/01DE-35", "cnpj", "12ABC34501DE35"],
    ["+55 (11) 91234-5678", "phone", "+5511912345678"],
    ["pix@example.com", "email", "pix@example.com"],
    ["123E4567-E12B-12D1-A456-426655440000", "evp", example.pixKey],
  ])("reads the key %s as %s", (raw, kind, key) => {
    expect(normalizePixKey(raw)).toEqual({ kind, key });
  });

  it.each([
    ["123.456.789-00", /CPF/],
    ["11.222.333/0001-80", /CNPJ/],
    ["+1 415 555 0132", /\+55/],
    ["not a key", /CPF, CNPJ/],
  ])("explains why %s isn't a key", (raw, message) => {
    const result = normalizePixKey(raw);
    expect("message" in result && result.message).toMatch(message);
  });

  it("holds the spec's limits", () => {
    expect(pixIssue({ ...example, name: "x".repeat(26) })?.field).toBe("name");
    expect(pixIssue({ ...example, city: "x".repeat(16) })?.field).toBe("city");
    expect(pixIssue({ ...example, txid: "has space" })?.field).toBe("txid");
    expect(pixIssue({ ...example, amount: "0" })?.field).toBe("amount");
    // Template 26 holds 99 characters: 18 for the GUI, 40 for this key.
    expect(pixIssue({ ...example, message: "x".repeat(37) })).toBeNull();
    expect(pixIssue({ ...example, message: "x".repeat(38) })?.field).toBe(
      "message",
    );
    expect(encodePix({ ...example, message: "x".repeat(38) })).toBe("");
  });

  it("reports the problem on its field in the form", () => {
    const result = pixSchema.safeParse({
      pixKey: "123.456.789-00",
      name: "Ana",
      city: "Rio",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["pixKey"]);
  });
});

describe("PromptPay", () => {
  it.each([
    ["mobile", "0801234567", undefined, PUBLISHED.promptpayPhone],
    ["mobile", "+66-89-123-4567", undefined, PUBLISHED.promptpayForeignPhone],
    ["id", "1111111111111", undefined, PUBLISHED.promptpayId],
    ["id", "0123456789012", undefined, PUBLISHED.promptpayTaxId],
    ["ewallet", "012345678901234", undefined, PUBLISHED.promptpayWallet],
  ] as const)(
    "%s %s holds the same data objects as the reference code",
    (proxyType, proxy, amount, expected) => {
      const payload = encodePromptPay({
        type: "promptpay",
        proxyType,
        proxy,
        amount,
      });
      expect(tree(payload)).toEqual(tree(expected));
    },
  );

  it("marks a code with an amount as dynamic, like the reference", () => {
    const payload = encodePromptPay({
      type: "promptpay",
      proxyType: "id",
      proxy: "1111111111111",
      amount: "4.22",
    });
    const fields = parseEmvPayload(payload)?.fields;
    expect(fields?.get("01")).toBe("12");
    expect(fields?.get("54")).toBe("4.22");
    expect(fields?.get("01")).toBe(
      parseEmvPayload(PUBLISHED.promptpayAmount)?.fields.get("01"),
    );
  });

  it("checks numbers and IDs", () => {
    expect(
      promptPayIssue({ proxyType: "mobile", proxy: "12345" })?.message,
    ).toMatch(/Thai mobile/);
    expect(promptPayIssue({ proxyType: "id", proxy: "123" })?.message).toMatch(
      /13 digits/,
    );
    expect(
      promptPayIssue({ proxyType: "ewallet", proxy: "123" })?.message,
    ).toMatch(/15 digits/);
  });
});

describe("VietQR", () => {
  it("matches the published static code byte for byte", () => {
    expect(
      encodeVietQr({
        type: "vietqr",
        bankBin: "970416",
        accountType: "account",
        accountNumber: "257678859",
      }),
    ).toBe(PUBLISHED.vietqrStatic);
  });

  it("matches the published code with an amount and message", () => {
    expect(
      encodeVietQr({
        type: "vietqr",
        bankBin: "970416",
        accountType: "account",
        accountNumber: "257678859",
        amount: "10000",
        message: "Chuyển tiền",
      }),
    ).toBe(PUBLISHED.vietqrAmount);
  });

  it("pays a card with QRIBFTTC", () => {
    const payload = encodeVietQr({
      type: "vietqr",
      bankBin: "970436",
      accountType: "card",
      accountNumber: "9704360000000000",
    });
    expect(
      emvTemplate(parseEmvPayload(payload)?.fields.get("38")).get("02"),
    ).toBe("QRIBFTTC");
  });

  it("checks the bank, number, amount and message", () => {
    const base = {
      bankBin: "970416",
      accountType: "account" as const,
      accountNumber: "257678859",
    };
    expect(vietQrIssue({ ...base, bankBin: "123456" })?.field).toBe("bankBin");
    expect(vietQrIssue({ ...base, accountNumber: "12" })?.field).toBe(
      "accountNumber",
    );
    expect(
      vietQrIssue({ ...base, accountType: "card", accountNumber: "12345678" })
        ?.field,
    ).toBe("accountNumber");
    expect(vietQrIssue({ ...base, amount: "10.5" })?.field).toBe("amount");
    expect(vietQrIssue({ ...base, message: "x".repeat(26) })?.field).toBe(
      "message",
    );
  });

  it("lists banks with unique 6-digit BINs", () => {
    const bins = VIETQR_BANKS.map((bank) => bank.bin);
    expect(bins.length).toBeGreaterThan(40);
    expect(new Set(bins).size).toBe(bins.length);
    for (const bin of bins) expect(bin).toMatch(/^\d{6}$/);
  });
});

describe("PayNow (SGQR)", () => {
  const now = new Date(2026, 10, 11);

  it("lays the code out like the reference generator", () => {
    const payload = encodePayNow(
      {
        type: "paynow",
        proxyType: "uen",
        proxy: "201403121W",
        amount: "500",
        editable: true,
        expiry: "2099-12-31",
        reference: "TQINV-10001",
        name: "ACME Pte Ltd",
      },
      now,
    );
    expect(tree(payload)).toEqual({
      "00": "01",
      "01": "12",
      "26": {
        "00": "SG.PAYNOW",
        "01": "2",
        "02": "201403121W",
        "03": "1",
        "04": "20991231",
      },
      "52": "0000",
      "53": "702",
      "54": "500.00",
      "58": "SG",
      "59": "ACME Pte Ltd",
      "60": "Singapore",
      "62": "0111TQINV-10001",
    });
  });

  it("pays a mobile number with a static code and an editable amount", () => {
    const fields = parseEmvPayload(
      encodePayNow({ type: "paynow", proxyType: "mobile", proxy: "9123 4567" }),
    )?.fields;
    expect(fields?.get("01")).toBe("11");
    const account = emvTemplate(fields?.get("26"));
    expect(account.get("01")).toBe("0");
    expect(account.get("02")).toBe("+6591234567");
    expect(account.get("03")).toBe("1");
    expect(fields?.get("59")).toBe("NA");
  });

  it("checks the proxy, amount and expiry", () => {
    expect(payNowIssue({ proxyType: "uen", proxy: "ABC" })?.field).toBe(
      "proxy",
    );
    expect(
      payNowIssue({ proxyType: "mobile", proxy: "6123 4567" })?.field,
    ).toBe("proxy");
    expect(
      payNowIssue({ proxyType: "mobile", proxy: "91234567", editable: false })
        ?.field,
    ).toBe("amount");
    expect(
      payNowIssue(
        { proxyType: "mobile", proxy: "91234567", expiry: "2020-01-01" },
        now,
      )?.message,
    ).toMatch(/past/);
    expect(
      payNowIssue(
        { proxyType: "mobile", proxy: "91234567", expiry: "2026-02-30" },
        now,
      )?.field,
    ).toBe("expiry");
  });
});

describe("SEPA credit transfer (EPC069-12)", () => {
  it("lays out the EPC's example transfer", () => {
    expect(
      buildEpcPayload({
        bic: "BHBLDEHHXXX",
        name: "Franz Mustermänn",
        iban: "DE71 1102 2033 0123 4567 89",
        amount: "12.3",
        reference: "RF18 5390 0754 7034",
      }),
    ).toBe(
      [
        "BCD",
        "002",
        "1",
        "SCT",
        "BHBLDEHHXXX",
        "Franz Mustermänn",
        "DE71110220330123456789",
        "EUR12.3",
        "",
        "RF18539007547034",
      ].join("\n"),
    );
  });

  it("puts free text on line 11 and drops empty trailing lines", () => {
    const payload = encodeSepa({
      type: "sepa",
      name: "Red Cross",
      iban: "BE72000000001616",
      remittance: "Urgency fund",
    });
    expect(payload.split("\n")).toEqual([
      "BCD",
      "002",
      "1",
      "SCT",
      "",
      "Red Cross",
      "BE72000000001616",
      "",
      "",
      "",
      "Urgency fund",
    ]);
  });

  it("checks IBANs, BICs and creditor references", () => {
    expect(checkIban("DE89 3704 0044 0532 0130 00")).toEqual({
      ok: true,
      iban: "DE89370400440532013000",
    });
    expect(checkIban("DE89 3704 0044 0532 0130 01")).toEqual({
      ok: false,
      reason: "checksum",
    });
    expect(checkIban("DE89 3704 0044 0532 0130")).toEqual({
      ok: false,
      reason: "length",
    });
    expect(checkIban("US12345678901234567")).toEqual({
      ok: false,
      reason: "country",
    });
    expect(isBic("COBADEFFXXX")).toBe(true);
    expect(isBic("COBADEFF")).toBe(true);
    expect(isBic("COBA")).toBe(false);
    expect(isCreditorReference("RF18 5390 0754 7034")).toBe(true);
    expect(isCreditorReference("RF19 5390 0754 7034")).toBe(false);
  });

  it("holds the limits the guidelines set", () => {
    const base = { name: "Ana", iban: "DE89370400440532013000" };
    expect(sepaIssue({ ...base, amount: "0" })?.field).toBe("amount");
    expect(sepaIssue({ ...base, amount: "1000000000" })?.field).toBe("amount");
    expect(
      sepaIssue({ ...base, reference: "RF18539007547034", remittance: "x" })
        ?.field,
    ).toBe("remittance");
    expect(sepaIssue({ ...base, remittance: "x".repeat(141) })?.field).toBe(
      "remittance",
    );
    expect(sepaIssue({ ...base, name: "x".repeat(71) })?.field).toBe("name");
    // 140 four-byte characters fit the field but not the 331-byte code.
    const long = sepaIssue({ ...base, remittance: "😀".repeat(80) });
    expect(long?.message).toMatch(String(EPC_MAX_BYTES));
    expect(long?.field).toBeUndefined();
  });

  it("reports the IBAN problem on its field in the form", () => {
    const result = sepaSchema.safeParse({
      name: "Ana",
      iban: "DE89 3704 0044 0532 0130 01",
    });
    expect(result.error?.issues[0]?.path).toEqual(["iban"]);
    expect(result.error?.issues[0]?.message).toMatch(/check digits/);
  });
});
