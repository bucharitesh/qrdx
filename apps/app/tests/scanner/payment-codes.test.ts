// The scanner reads the bank payment codes (EMV: Pix, PayNow, PromptPay,
// VietQR) and crypto URIs the playground makes, and published ones.
import { describe, expect, it } from "vitest";
import { type ParsedScan, parseScan } from "@/components/scanner/parse";
import type { QRContentConfig } from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";
import { PUBLISHED } from "../support/emv-published";

function payment(raw: string) {
  const parsed = parseScan(raw);
  expect(parsed.kind, raw).toBe("payment");
  return parsed as Extract<ParsedScan, { kind: "payment" }>;
}

const field = (
  parsed: { fields: { label: string; value: string }[] },
  label: string,
) => parsed.fields.find((item) => item.label === label)?.value;

describe("published EMV codes", () => {
  it("reads the Banco Central's Pix example", () => {
    const parsed = payment(PUBLISHED.pix);
    expect(parsed.scheme).toBe("pix");
    expect(parsed.payee).toBe("Fulano de Tal");
    expect(field(parsed, "Pix key")).toBe(
      "123e4567-e12b-12d1-a456-426655440000",
    );
    expect(field(parsed, "City")).toBe("BRASILIA");
    expect(field(parsed, "Transaction ID")).toBe("***");
    expect(field(parsed, "Checksum")).toBeUndefined();
  });

  it("reads VietQR with the bank's name", () => {
    const parsed = payment(PUBLISHED.vietqrAmount);
    expect(parsed.scheme).toBe("vietqr");
    expect(parsed.amount).toBe("VND 10000");
    expect(field(parsed, "Bank")).toBe("ACB (970416)");
    expect(field(parsed, "Account number")).toBe("257678859");
    expect(field(parsed, "Message")).toBe("Chuyen tien");
  });

  it("reads PromptPay numbers as dialled", () => {
    expect(field(payment(PUBLISHED.promptpayPhone), "Mobile number")).toBe(
      "+66801234567",
    );
    expect(field(payment(PUBLISHED.promptpayId), "National or tax ID")).toBe(
      "1111111111111",
    );
    expect(payment(PUBLISHED.promptpayAmount).amount).toBe("THB 4.22");
  });

  it("warns when the checksum doesn't match", () => {
    const parsed = payment(`${PUBLISHED.pix.slice(0, -4)}0000`);
    expect(field(parsed, "Checksum")).toMatch(/damaged/);
  });

  it("names the merchant of another EMV code", () => {
    const other = encodeQRContent({
      type: "pix",
      pixKey: "123e4567-e12b-12d1-a456-426655440000",
      name: "Loja",
      city: "Rio",
    }).replace("br.gov.bcb.pix", "com.example.pp");
    // The CRC no longer matches, but the code still parses.
    const parsed = payment(other);
    expect(parsed.scheme).toBe("emv");
    expect(parsed.payee).toBe("Loja");
  });

  it("leaves GS1 strings that start like EMV to the GS1 reader", () => {
    expect(parseScan("00012345678901234560").kind).not.toBe("payment");
  });
});

describe("encode → parseScan", () => {
  it.each<[QRContentConfig, string, string | undefined]>([
    [
      {
        type: "pix",
        pixKey: "+55 11 91234 5678",
        name: "Ana",
        city: "Rio",
        amount: "5",
      },
      "pix",
      "BRL 5.00",
    ],
    [
      {
        type: "paynow",
        proxyType: "mobile",
        proxy: "+65 9123 4567",
        amount: "8.5",
        reference: "INV1",
      },
      "paynow",
      "SGD 8.50",
    ],
    [
      { type: "promptpay", proxyType: "ewallet", proxy: "012345678901234" },
      "promptpay",
      undefined,
    ],
    [
      {
        type: "vietqr",
        bankBin: "970436",
        accountType: "card",
        accountNumber: "9704360000000000",
        amount: "20000",
      },
      "vietqr",
      "VND 20000",
    ],
    [
      {
        type: "litecoin",
        address: "ltc1qg82gu5m5c5szdx4rgrqx0ymcx8jvjf0v3qyp5c",
        amount: "0.5",
      },
      "litecoin",
      "0.5 LTC",
    ],
    [
      {
        type: "dogecoin",
        address: "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L",
        amount: "42",
      },
      "dogecoin",
      "42 DOGE",
    ],
    [
      {
        type: "bitcoincash",
        address: "qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
      },
      "bitcoincash",
      undefined,
    ],
    [
      {
        type: "solana",
        address: "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN",
        amount: "1",
        label: "Café",
      },
      "solana",
      "1 SOL",
    ],
    [
      {
        type: "monero",
        address:
          "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A",
        amount: "0.25",
        label: "Donation",
      },
      "monero",
      "0.25 XMR",
    ],
  ])("%o reads back as %s", (config, scheme, amount) => {
    const parsed = payment(encodeQRContent(config));
    expect(parsed.scheme).toBe(scheme);
    expect(parsed.amount).toBe(amount);
    expect(field(parsed, "Checksum")).toBeUndefined();
  });

  it("reads a SEPA code back with its IBAN", () => {
    const parsed = payment(
      encodeQRContent({
        type: "sepa",
        name: "Ana Lima",
        iban: "DE89 3704 0044 0532 0130 00",
        amount: "12.30",
        remittance: "Invoice 42",
      }),
    );
    expect(parsed.scheme).toBe("epc");
    expect(parsed.payee).toBe("Ana Lima");
    expect(parsed.copyValue).toBe("DE89370400440532013000");
    expect(parsed.amount).toBe("EUR 12.30");
    expect(field(parsed, "Remittance info")).toBe("Invoice 42");
  });

  it("names the label and description of a Monero request", () => {
    const parsed = payment(
      "monero:44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A?tx_amount=1&recipient_name=Shop&tx_description=Order%2012",
    );
    expect(field(parsed, "Name")).toBe("Shop");
    expect(field(parsed, "Description")).toBe("Order 12");
  });
});
