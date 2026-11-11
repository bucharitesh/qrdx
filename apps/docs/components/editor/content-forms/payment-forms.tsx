"use client";

// Forms for the bank payment QR standards: Pix, SEPA (EPC), PayNow,
// PromptPay and VietQR. What people type here stays in this browser: the
// playground never puts payment details in a link (lib/playground-links.ts).

import { Button } from "@repo/design-system/components/ui/button";
import {
  paynowSchema,
  pixSchema,
  promptpaySchema,
  sepaSchema,
  vietqrSchema,
} from "@/lib/validations/qr-content";
import { VIETQR_BANKS } from "@/lib/vietqr-banks";
import { useQREditorStore } from "@/store/editor-store";
import { EPC_ERROR_CORRECTION } from "@/utils/epc-qr";
import { type FormField, SchemaForm } from "./schema-form";

const PIX_FIELDS: FormField[] = [
  {
    name: "pixKey",
    label: "Pix key",
    required: true,
    placeholder: "CPF, CNPJ, +55 phone, email or random key",
    hint: "The key you registered at your bank.",
    mono: true,
  },
  {
    name: "name",
    label: "Receiver name",
    required: true,
    placeholder: "Name on the account",
    hint: "Up to 25 characters. Accents are dropped, as banks expect.",
  },
  {
    name: "city",
    label: "City",
    required: true,
    placeholder: "Sao Paulo",
    hint: "Up to 15 characters.",
  },
  {
    name: "amount",
    label: "Amount (R$)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "message",
    label: "Message",
    placeholder: "Shown to the payer in some apps",
  },
  {
    name: "txid",
    label: "Transaction ID",
    placeholder: "***",
    hint: "Letters and digits, to match payments in your statement. Optional.",
    mono: true,
  },
];

export function PixForm() {
  return (
    <SchemaForm
      fields={PIX_FIELDS}
      note="Scanning opens the payer's bank app with a Pix payment filled in. Pix copia e cola uses the same text."
      schema={pixSchema}
      type="pix"
    />
  );
}

const SEPA_FIELDS: FormField[] = [
  {
    name: "name",
    label: "Beneficiary name",
    required: true,
    placeholder: "Name on the account",
  },
  {
    name: "iban",
    label: "IBAN",
    required: true,
    placeholder: "DE89 3704 0044 0532 0130 00",
    mono: true,
    autoComplete: "off",
  },
  {
    name: "bic",
    label: "BIC",
    placeholder: "Optional inside the EEA",
    mono: true,
  },
  {
    name: "amount",
    label: "Amount (€)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "remittance",
    label: "Payment reference",
    placeholder: "Invoice 2026-114",
    hint: "Up to 140 characters, shown on both statements.",
  },
  {
    name: "reference",
    label: "Creditor reference (RF)",
    placeholder: "RF18 5390 0754 7034",
    hint: "Only if your invoices use a structured RF reference. Use it or a payment reference, not both.",
    mono: true,
  },
];

/** EPC069-12 asks for level M; offers it when the design uses another. */
function EpcLevelNotice() {
  const level = useQREditorStore((state) => state.themeState.styles.level);
  if ((level ?? "L") === EPC_ERROR_CORRECTION) return null;
  const switchToLevelM = () => {
    const { themeState, setThemeState } = useQREditorStore.getState();
    setThemeState({
      ...themeState,
      styles: { ...themeState.styles, level: EPC_ERROR_CORRECTION },
    });
  };
  return (
    <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-[11px] leading-relaxed text-pretty">
        The EPC guidelines ask for error correction level M. This design uses{" "}
        {level ?? "L"}.
      </p>
      <Button
        className="h-7 shrink-0 px-2.5 text-xs"
        onClick={switchToLevelM}
        size="sm"
        type="button"
        variant="outline"
      >
        Use level M
      </Button>
    </div>
  );
}

export function SepaForm() {
  return (
    <SchemaForm
      fields={SEPA_FIELDS}
      note="Scanning fills in a euro transfer in banking apps that read EPC codes (often called GiroCode)."
      schema={sepaSchema}
      type="sepa"
    >
      <EpcLevelNotice />
    </SchemaForm>
  );
}

const PAYNOW_FIELDS: FormField[] = [
  {
    name: "proxyType",
    label: "Pay to",
    kind: "select",
    initial: "mobile",
    resets: ["proxy"],
    options: [
      { value: "mobile", label: "Mobile number" },
      { value: "uen", label: "Business (UEN)" },
    ],
  },
  {
    name: "proxy",
    label: "Mobile number",
    required: true,
    placeholder: "+65 9123 4567",
    inputMode: "tel",
    when: (values) => values.proxyType !== "uen",
  },
  {
    name: "proxy",
    label: "UEN",
    required: true,
    placeholder: "201403121W",
    mono: true,
    when: (values) => values.proxyType === "uen",
  },
  {
    name: "name",
    label: "Name",
    placeholder: "Shown in the payer's app",
  },
  {
    name: "amount",
    label: "Amount (S$)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "editable",
    label: "Payer can change the amount",
    kind: "switch",
    initial: true,
    when: (values) =>
      typeof values.amount === "string" && values.amount.trim() !== "",
  },
  {
    name: "reference",
    label: "Reference",
    placeholder: "INV-1024",
    hint: "Shows on your statement, so you can match the payment.",
  },
  {
    name: "expiry",
    label: "Expires",
    kind: "date",
    hint: "Optional. Banking apps refuse the code after this day.",
  },
];

export function PayNowForm() {
  return (
    <SchemaForm
      fields={PAYNOW_FIELDS}
      note="Scanning opens PayNow in any Singapore banking app, with these details filled in."
      schema={paynowSchema}
      type="paynow"
    />
  );
}

const PROMPTPAY_FIELDS: FormField[] = [
  {
    name: "proxyType",
    label: "Pay to",
    kind: "select",
    initial: "mobile",
    resets: ["proxy"],
    options: [
      { value: "mobile", label: "Mobile number" },
      { value: "id", label: "National ID or tax ID" },
      { value: "ewallet", label: "E-wallet ID" },
    ],
  },
  {
    name: "proxy",
    label: "Mobile number",
    required: true,
    placeholder: "081 234 5678",
    inputMode: "tel",
    when: (values) => (values.proxyType ?? "mobile") === "mobile",
  },
  {
    name: "proxy",
    label: "National ID or tax ID",
    required: true,
    placeholder: "13 digits",
    inputMode: "numeric",
    mono: true,
    when: (values) => values.proxyType === "id",
  },
  {
    name: "proxy",
    label: "E-wallet ID",
    required: true,
    placeholder: "15 digits",
    inputMode: "numeric",
    mono: true,
    when: (values) => values.proxyType === "ewallet",
  },
  {
    name: "amount",
    label: "Amount (฿)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
    hint: "With an amount, the Thai QR standard marks the code for a single payment.",
  },
];

export function PromptPayForm() {
  return (
    <SchemaForm
      fields={PROMPTPAY_FIELDS}
      note="Scanning opens a PromptPay transfer in any Thai banking app."
      schema={promptpaySchema}
      type="promptpay"
    />
  );
}

const BANK_OPTIONS = VIETQR_BANKS.map((bank) => ({
  value: bank.bin,
  label: `${bank.shortName} (${bank.code})`,
}));

const VIETQR_FIELDS: FormField[] = [
  {
    name: "bankBin",
    label: "Bank",
    kind: "select",
    required: true,
    placeholder: "Choose the bank",
    options: BANK_OPTIONS,
  },
  {
    name: "accountType",
    label: "Pay to",
    kind: "select",
    initial: "account",
    resets: ["accountNumber"],
    options: [
      { value: "account", label: "Account number" },
      { value: "card", label: "Card number" },
    ],
  },
  {
    name: "accountNumber",
    label: "Account number",
    required: true,
    placeholder: "Account number",
    inputMode: "numeric",
    mono: true,
    when: (values) => values.accountType !== "card",
  },
  {
    name: "accountNumber",
    label: "Card number",
    required: true,
    placeholder: "16 to 19 digits",
    inputMode: "numeric",
    mono: true,
    when: (values) => values.accountType === "card",
  },
  {
    name: "amount",
    label: "Amount (₫)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "numeric",
  },
  {
    name: "message",
    label: "Message",
    placeholder: "Thanh toan don hang",
    hint: "Up to 25 characters. Vietnamese accents are dropped, as banks expect.",
  },
];

export function VietQrForm() {
  return (
    <SchemaForm
      fields={VIETQR_FIELDS}
      note="Scanning opens a transfer in Vietnamese banking apps that read VietQR."
      schema={vietqrSchema}
      type="vietqr"
    />
  );
}
