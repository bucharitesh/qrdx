// SEPA credit transfer QR codes, to the European Payments Council's
// "Quick Response Code: Guidelines to Enable Data Capture for the Initiation
// of a SEPA Credit Transfer" (EPC069-12, version 3): the "BCD" format that
// European banking apps scan to fill in a transfer. Not EMV: plain lines of
// text, at most 331 bytes, printed at error correction level M.

const utf8 = new TextEncoder();

/** The EPC069-12 payload limit, in bytes. */
export const EPC_MAX_BYTES = 331;

/** EPC069-12 asks for error correction level M. */
export const EPC_ERROR_CORRECTION = "M";

/** Field limits from EPC069-12 §3. */
export const EPC_LIMITS = {
  name: 70,
  reference: 35,
  remittance: 140,
  information: 70,
} as const;

/** Largest amount a code may ask for, in euros. */
export const EPC_MAX_AMOUNT = 999_999_999.99;

/** IBAN length per country (ISO 13616 registry), for the SEPA countries. */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24,
  AT: 20,
  BE: 16,
  BG: 22,
  CH: 21,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  EE: 20,
  ES: 24,
  FI: 18,
  FR: 27,
  GB: 22,
  GI: 23,
  GR: 27,
  HR: 21,
  HU: 28,
  IE: 22,
  IS: 26,
  IT: 27,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MT: 31,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  RO: 24,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  VA: 22,
};

/** Spaces removed, upper case: "de89 3704 0044…" → "DE893704…". */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** ISO 7064 MOD 97-10 over letters-as-numbers (A=10 … Z=35). */
function mod97(value: string): number {
  let remainder = 0;
  for (const char of value) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

export type IbanCheck =
  | { ok: true; iban: string }
  | { ok: false; reason: "format" | "country" | "length" | "checksum" };

/** An IBAN from a SEPA country, with its length and check digits right. */
export function checkIban(raw: string): IbanCheck {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    return { ok: false, reason: "format" };
  }
  const length = IBAN_LENGTHS[iban.slice(0, 2)];
  if (!length) return { ok: false, reason: "country" };
  if (iban.length !== length) return { ok: false, reason: "length" };
  if (mod97(`${iban.slice(4)}${iban.slice(0, 4)}`) !== 1) {
    return { ok: false, reason: "checksum" };
  }
  return { ok: true, iban };
}

/** A BIC (ISO 9362): 8 or 11 characters, e.g. "COBADEFFXXX". */
export function isBic(raw: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(
    raw.replace(/\s+/g, "").toUpperCase(),
  );
}

/**
 * A structured creditor reference (ISO 11649): "RF", two check digits and
 * up to 21 letters or digits, with the check digits right.
 */
export function isCreditorReference(raw: string): boolean {
  const reference = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(reference)) return false;
  return mod97(`${reference.slice(4)}${reference.slice(0, 4)}`) === 1;
}

/** "12.3" → "EUR12.3"; the guidelines allow 1 or 2 decimals, no zeros forced. */
function epcAmount(raw: string): string {
  const [whole = "", fraction] = raw.trim().replace(",", ".").split(".");
  const digits = whole.replace(/^0+(?=\d)/, "");
  return fraction ? `EUR${digits}.${fraction}` : `EUR${digits}`;
}

export interface EpcTransfer {
  name: string;
  iban: string;
  bic?: string;
  /** Euros, "12.30" or "12,30" */
  amount?: string;
  /** Structured creditor reference (RF…); never together with `remittance`. */
  reference?: string;
  /** Free text for the beneficiary; never together with `reference`. */
  remittance?: string;
  /** Note shown to the person paying. */
  information?: string;
}

/**
 * The EPC069-12 payload (version 002, UTF-8, SEPA credit transfer), lines
 * joined with LF and empty trailing lines left out. Fields aren't checked
 * here; use epcIssue first.
 */
export function buildEpcPayload(transfer: EpcTransfer): string {
  const single = (value: string | undefined) =>
    (value ?? "").replace(/[\r\n]+/g, " ").trim();
  const amount = single(transfer.amount);
  const lines = [
    "BCD",
    "002",
    "1",
    "SCT",
    single(transfer.bic).replace(/\s+/g, "").toUpperCase(),
    single(transfer.name),
    normalizeIban(transfer.iban),
    amount ? epcAmount(amount) : "",
    "",
    single(transfer.reference).replace(/\s+/g, "").toUpperCase(),
    single(transfer.remittance),
    single(transfer.information),
  ];
  while (lines.at(-1) === "") lines.pop();
  return lines.join("\n");
}

export interface EpcIssue {
  field: keyof EpcTransfer | "payload";
  message: string;
}

/** The first problem with a transfer, or null when it makes a valid code. */
export function epcIssue(transfer: Partial<EpcTransfer>): EpcIssue | null {
  const name = transfer.name?.trim() ?? "";
  if (!name) {
    return { field: "name", message: "Beneficiary name is required" };
  }
  if ([...name].length > EPC_LIMITS.name) {
    return {
      field: "name",
      message: `Names are at most ${EPC_LIMITS.name} characters`,
    };
  }
  if (!transfer.iban?.trim()) {
    return { field: "iban", message: "IBAN is required" };
  }
  const iban = checkIban(transfer.iban);
  if (!iban.ok) {
    return {
      field: "iban",
      message:
        iban.reason === "checksum"
          ? "This IBAN's check digits don't match. Check it for typos."
          : iban.reason === "country"
            ? "Use an IBAN from a SEPA country"
            : iban.reason === "length"
              ? "This IBAN has the wrong length for its country"
              : "Enter an IBAN, like DE89 3704 0044 0532 0130 00",
    };
  }
  if (transfer.bic?.trim() && !isBic(transfer.bic)) {
    return {
      field: "bic",
      message: "A BIC has 8 or 11 letters and digits, like COBADEFFXXX",
    };
  }
  const amount = transfer.amount?.trim();
  if (amount) {
    const normalized = amount.replace(",", ".");
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(normalized) ||
      Number(normalized) < 0.01 ||
      Number(normalized) > EPC_MAX_AMOUNT
    ) {
      return {
        field: "amount",
        message:
          "Amounts are 0.01 to 999,999,999.99 euros, with up to 2 decimals",
      };
    }
  }
  const reference = transfer.reference?.trim();
  const remittance = transfer.remittance?.trim();
  if (reference && remittance) {
    return {
      field: "remittance",
      message: "Use a creditor reference or a message, not both",
    };
  }
  if (reference && !isCreditorReference(reference)) {
    return {
      field: "reference",
      message:
        "A creditor reference starts with RF and two check digits, like RF18 5390 0754 7034",
    };
  }
  if (remittance && [...remittance].length > EPC_LIMITS.remittance) {
    return {
      field: "remittance",
      message: `Messages are at most ${EPC_LIMITS.remittance} characters`,
    };
  }
  const information = transfer.information?.trim();
  if (information && [...information].length > EPC_LIMITS.information) {
    return {
      field: "information",
      message: `Notes are at most ${EPC_LIMITS.information} characters`,
    };
  }
  const bytes = utf8.encode(buildEpcPayload(transfer as EpcTransfer)).length;
  if (bytes > EPC_MAX_BYTES) {
    return {
      field: "payload",
      message: `SEPA codes hold at most ${EPC_MAX_BYTES} bytes (this one is ${bytes}). Shorten the name or message.`,
    };
  }
  return null;
}
