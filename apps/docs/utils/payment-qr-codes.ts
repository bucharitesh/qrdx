// Encoders and checks for the bank-payment QR standards: Pix (Brazil),
// PayNow (Singapore), PromptPay (Thailand) and VietQR (Vietnam), all EMV
// merchant-presented payloads built with utils/emv-qr.ts, and SEPA credit
// transfers (EPC069-12, utils/epc-qr.ts). Each encoder returns "" while its
// content has a problem, so a broken payment code is never drawn.

import { vietQrBank } from "@/lib/vietqr-banks";
import type {
  PayNowContent,
  PixContent,
  PromptPayContent,
  SepaContent,
  VietQrContent,
} from "@/types/qr-content";
import {
  buildEmvPayload,
  type EmvObject,
  emvAmount,
  toEmvText,
} from "./emv-qr";
import { buildEpcPayload, epcIssue } from "./epc-qr";

export interface PaymentIssue {
  /** The form field the problem is in */
  field?: string;
  message: string;
}

const issue = (field: string, message: string): PaymentIssue => ({
  field,
  message,
});

/** The payload format indicator every EMV code starts with. */
const FORMAT: EmvObject = ["00", "01"];
/** Point of initiation: "11" reusable, "12" one payment (amount or expiry). */
const STATIC_CODE: EmvObject = ["01", "11"];
const ONE_TIME_CODE: EmvObject = ["01", "12"];

function amountIssue(
  raw: string | undefined,
  decimals: number,
  currency: string,
): PaymentIssue | null {
  if (!raw?.trim()) return null;
  return emvAmount(raw, decimals)
    ? null
    : issue(
        "amount",
        decimals > 0
          ? `Enter an amount in ${currency} with up to ${decimals} decimals, like 12.50`
          : `Enter a whole amount in ${currency}, like 50000`,
      );
}

// ─── Pix (Banco Central do Brasil, Manual de Padrões para Iniciação do Pix) ──

export type PixKeyKind = "cpf" | "cnpj" | "phone" | "email" | "evp";

/** Mod-11 check digits shared by CPF and CNPJ (CNPJ letters count as code − 48). */
function mod11Digit(values: number[], weights: number[]): number {
  const sum = values.reduce(
    (total, value, index) => total + value * (weights[index] ?? 0),
    0,
  );
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function isCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const values = [...digits].map(Number);
  const first = mod11Digit(values.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = mod11Digit(
    values.slice(0, 10),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return first === values[9] && second === values[10];
}

/** Numeric CNPJs and the alphanumeric ones issued from July 2026. */
function isCnpj(value: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(value) || /^(\d)\1{13}$/.test(value)) {
    return false;
  }
  const values = [...value].map((char) => char.charCodeAt(0) - 48);
  const first = mod11Digit(
    values.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const second = mod11Digit(
    values.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return first === values[12] && second === values[13];
}

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A Pix key as the DICT stores it: CPF and CNPJ as bare digits (letters for
 * new CNPJs), phones as +55 and 10-11 digits, random keys in lower case.
 */
export function normalizePixKey(
  raw: string,
): { kind: PixKeyKind; key: string } | PaymentIssue {
  const value = raw.trim();
  if (!value) return issue("pixKey", "Pix key is required");
  if (value.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 77
      ? { kind: "email", key: value }
      : issue("pixKey", "Enter a valid email key");
  }
  if (EVP.test(value)) return { kind: "evp", key: value.toLowerCase() };
  if (value.startsWith("+")) {
    const digits = value.replace(/[^\d]/g, "");
    return /^55\d{10,11}$/.test(digits)
      ? { kind: "phone", key: `+${digits}` }
      : issue(
          "pixKey",
          "Phone keys are +55, the area code and the number, like +55 11 91234 5678",
        );
  }
  const compact = value.replace(/[\s./-]/g, "").toUpperCase();
  if (/^\d{11}$/.test(compact)) {
    return isCpf(compact)
      ? { kind: "cpf", key: compact }
      : issue(
          "pixKey",
          "This CPF's check digits don't match. For a phone key, start with +55.",
        );
  }
  if (/^[0-9A-Z]{14}$/.test(compact)) {
    return isCnpj(compact)
      ? { kind: "cnpj", key: compact }
      : issue("pixKey", "This CNPJ's check digits don't match");
  }
  return issue(
    "pixKey",
    "Use a CPF, CNPJ, +55 phone number, email or random key",
  );
}

const PIX_GUI = "br.gov.bcb.pix";
const PIX_MAX_NAME = 25;
const PIX_MAX_CITY = 15;
const PIX_MAX_TXID = 25;

export function pixIssue(content: Partial<PixContent>): PaymentIssue | null {
  const key = normalizePixKey(content.pixKey ?? "");
  if ("message" in key) return key;
  const name = toEmvText(content.name ?? "");
  if (!name) return issue("name", "Receiver name is required");
  if (name.length > PIX_MAX_NAME) {
    return issue("name", `Names are at most ${PIX_MAX_NAME} characters`);
  }
  const city = toEmvText(content.city ?? "");
  if (!city) return issue("city", "City is required");
  if (city.length > PIX_MAX_CITY) {
    return issue("city", `Cities are at most ${PIX_MAX_CITY} characters`);
  }
  const amount = amountIssue(content.amount, 2, "reais");
  if (amount) return amount;
  const txid = content.txid?.trim();
  if (txid && txid !== "***" && !/^[A-Za-z0-9]{1,25}$/.test(txid)) {
    return issue(
      "txid",
      `Transaction IDs are up to ${PIX_MAX_TXID} letters and digits`,
    );
  }
  // The merchant account template (ID 26) holds at most 99 characters:
  // the GUI (18), the key and the message, each with a 4-character header.
  const message = toEmvText(content.message ?? "");
  const room = 99 - 18 - (4 + key.key.length) - 4;
  if (message.length > room) {
    return issue(
      "message",
      room > 0
        ? `With this key the message can be at most ${room} characters`
        : "This key leaves no room for a message",
    );
  }
  return null;
}

/** A static Pix BR Code ("Pix copia e cola"). */
export function encodePix(content: PixContent): string {
  if (pixIssue(content)) return "";
  const key = normalizePixKey(content.pixKey) as { key: string };
  const message = toEmvText(content.message ?? "");
  const amount = content.amount?.trim() ? emvAmount(content.amount, 2) : null;
  return buildEmvPayload([
    FORMAT,
    [
      "26",
      [
        ["00", PIX_GUI],
        ["01", key.key],
        ["02", message],
      ],
    ],
    ["52", "0000"],
    ["53", "986"],
    ["54", amount ?? ""],
    ["58", "BR"],
    ["59", toEmvText(content.name)],
    ["60", toEmvText(content.city)],
    ["62", [["05", content.txid?.trim() || "***"]]],
  ]);
}

// ─── PayNow (SGQR, EMV merchant-presented, GUI SG.PAYNOW) ───────────────────

/** "+65 9123 4567", "91234567" or "6591234567" → "+6591234567". */
export function normalizeSgMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  const local =
    digits.length === 10 && digits.startsWith("65") ? digits.slice(2) : digits;
  return /^[89]\d{7}$/.test(local) ? `+65${local}` : null;
}

/**
 * A Singapore UEN: 8 digits and a letter (businesses), 9 digits and a letter
 * (local companies) or T/S/R, 2 digits, 2 letters, 4 digits and a letter
 * (other entities), optionally followed by a bank's suffix of up to 3
 * letters or digits.
 */
export function normalizeUen(raw: string): string | null {
  const uen = raw.replace(/\s+/g, "").toUpperCase();
  return /^(?:\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])[A-Z0-9]{0,3}$/.test(
    uen,
  )
    ? uen
    : null;
}

/** "2026-12-31" → "20261231"; null when it isn't a real date. */
function compactDate(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day] = match as unknown as [
    string,
    string,
    string,
    string,
  ];
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? `${year}${month}${day}`
    : null;
}

/** Today on this device, as YYYYMMDD (codes are made where they are printed). */
function today(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

export function payNowIssue(
  content: Partial<PayNowContent>,
  now?: Date,
): PaymentIssue | null {
  const proxy = content.proxy?.trim() ?? "";
  if (content.proxyType === "uen") {
    if (!proxy) return issue("proxy", "UEN is required");
    if (!normalizeUen(proxy)) {
      return issue("proxy", "Enter a UEN, like 201403121W");
    }
  } else {
    if (!proxy) return issue("proxy", "Mobile number is required");
    if (!normalizeSgMobile(proxy)) {
      return issue(
        "proxy",
        "Enter a Singapore mobile number, like +65 9123 4567",
      );
    }
  }
  const amount = amountIssue(content.amount, 2, "dollars");
  if (amount) return amount;
  if (content.editable === false && !content.amount?.trim()) {
    return issue("amount", "Set an amount, or let the payer enter one");
  }
  const reference = toEmvText(content.reference ?? "");
  if (reference.length > 25) {
    return issue("reference", "References are at most 25 characters");
  }
  if (content.expiry?.trim()) {
    const expiry = compactDate(content.expiry);
    if (!expiry) return issue("expiry", "Pick a date for the code to expire");
    if (expiry < today(now)) {
      return issue("expiry", "The expiry date is in the past");
    }
  }
  const name = toEmvText(content.name ?? "");
  if (name.length > 25) {
    return issue("name", "Names are at most 25 characters");
  }
  return null;
}

/** A PayNow code to a mobile number or UEN. */
export function encodePayNow(content: PayNowContent, now?: Date): string {
  if (payNowIssue(content, now)) return "";
  const isUen = content.proxyType === "uen";
  const proxy = isUen
    ? (normalizeUen(content.proxy) as string)
    : (normalizeSgMobile(content.proxy) as string);
  const amount = content.amount?.trim() ? emvAmount(content.amount, 2) : null;
  const expiry = content.expiry?.trim() ? compactDate(content.expiry) : null;
  const editable = !amount || content.editable !== false;
  return buildEmvPayload([
    FORMAT,
    amount || expiry ? ONE_TIME_CODE : STATIC_CODE,
    [
      "26",
      [
        ["00", "SG.PAYNOW"],
        ["01", isUen ? "2" : "0"],
        ["02", proxy],
        ["03", editable ? "1" : "0"],
        ["04", expiry ?? ""],
      ],
    ],
    ["52", "0000"],
    ["53", "702"],
    ["54", amount ?? ""],
    ["58", "SG"],
    ["59", toEmvText(content.name ?? "") || "NA"],
    ["60", "Singapore"],
    ["62", [["01", toEmvText(content.reference ?? "")]]],
  ]);
}

// ─── PromptPay (Thai QR Code Payment Standard, AID A000000677010111) ────────

/** "081 234 5678" or "+66 81 234 5678" → "0812345678". */
export function normalizeThaiMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  const local =
    digits.startsWith("66") && digits.length === 11
      ? `0${digits.slice(2)}`
      : digits;
  return /^0[689]\d{8}$/.test(local) ? local : null;
}

export function promptPayIssue(
  content: Partial<PromptPayContent>,
): PaymentIssue | null {
  const proxy = content.proxy?.trim() ?? "";
  const digits = proxy.replace(/[\s-]/g, "");
  switch (content.proxyType ?? "mobile") {
    case "id":
      if (!proxy) return issue("proxy", "National ID or tax ID is required");
      if (!/^\d{13}$/.test(digits)) {
        return issue("proxy", "National and tax IDs are 13 digits");
      }
      break;
    case "ewallet":
      if (!proxy) return issue("proxy", "E-wallet ID is required");
      if (!/^\d{15}$/.test(digits)) {
        return issue("proxy", "E-wallet IDs are 15 digits");
      }
      break;
    default:
      if (!proxy) return issue("proxy", "Mobile number is required");
      if (!normalizeThaiMobile(proxy)) {
        return issue("proxy", "Enter a Thai mobile number, like 081 234 5678");
      }
  }
  return amountIssue(content.amount, 2, "baht");
}

/** A PromptPay code; with an amount it is a one-payment code, as the standard says. */
export function encodePromptPay(content: PromptPayContent): string {
  if (promptPayIssue(content)) return "";
  const type = content.proxyType ?? "mobile";
  const digits = content.proxy.replace(/[\s-]/g, "");
  const target: EmvObject =
    type === "id"
      ? ["02", digits]
      : type === "ewallet"
        ? ["03", digits]
        : // 0066 and the number without its leading 0, 13 digits in all.
          [
            "01",
            `0066${(normalizeThaiMobile(content.proxy) as string).slice(1)}`,
          ];
  const amount = content.amount?.trim() ? emvAmount(content.amount, 2) : null;
  return buildEmvPayload([
    FORMAT,
    amount ? ONE_TIME_CODE : STATIC_CODE,
    ["29", [["00", "A000000677010111"], target]],
    ["53", "764"],
    ["54", amount ?? ""],
    ["58", "TH"],
  ]);
}

// ─── VietQR (NAPAS, GUID A000000727) ─────────────────────────────────────────

export function vietQrIssue(
  content: Partial<VietQrContent>,
): PaymentIssue | null {
  if (!content.bankBin?.trim()) return issue("bankBin", "Bank is required");
  if (!vietQrBank(content.bankBin)) {
    return issue("bankBin", "Pick a bank from the list");
  }
  const number = content.accountNumber?.replace(/\s+/g, "") ?? "";
  const card = content.accountType === "card";
  if (!number) {
    return issue(
      "accountNumber",
      card ? "Card number is required" : "Account number is required",
    );
  }
  if (
    card ? !/^\d{16,19}$/.test(number) : !/^[A-Za-z0-9]{6,19}$/.test(number)
  ) {
    return issue(
      "accountNumber",
      card
        ? "Card numbers are 16 to 19 digits"
        : "Account numbers are 6 to 19 letters and digits",
    );
  }
  const amount = amountIssue(content.amount, 0, "dong");
  if (amount) return amount;
  if (toEmvText(content.message ?? "").length > 25) {
    return issue("message", "Messages are at most 25 characters");
  }
  return null;
}

/** A VietQR transfer to an account or card. */
export function encodeVietQr(content: VietQrContent): string {
  if (vietQrIssue(content)) return "";
  const amount = content.amount?.trim() ? emvAmount(content.amount, 0) : null;
  return buildEmvPayload([
    FORMAT,
    amount ? ONE_TIME_CODE : STATIC_CODE,
    [
      "38",
      [
        ["00", "A000000727"],
        [
          "01",
          [
            ["00", content.bankBin.trim()],
            ["01", content.accountNumber.replace(/\s+/g, "")],
          ],
        ],
        ["02", content.accountType === "card" ? "QRIBFTTC" : "QRIBFTTA"],
      ],
    ],
    ["53", "704"],
    ["54", amount ?? ""],
    ["58", "VN"],
    ["62", [["08", toEmvText(content.message ?? "")]]],
  ]);
}

// ─── SEPA credit transfer (EPC069-12) ───────────────────────────────────────

export function sepaIssue(content: Partial<SepaContent>): PaymentIssue | null {
  const found = epcIssue(content);
  return found
    ? {
        field: found.field === "payload" ? undefined : found.field,
        message: found.message,
      }
    : null;
}

/** An EPC "BCD" SEPA credit transfer. */
export function encodeSepa(content: SepaContent): string {
  if (sepaIssue(content)) return "";
  return buildEpcPayload(content);
}
