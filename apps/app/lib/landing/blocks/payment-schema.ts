import { z } from "zod";
import {
  itemIdSchema,
  lineText,
  linkUrlSchema,
  longText,
} from "@/components/landing/block-kit";

// Props of the payment block (shared by its Render and Editor): the ways
// someone can pay or donate, each a link to the payment app's own page
// and/or details to copy (a bank account, a UPI ID, a wallet address).
// The page never takes a payment itself: no card details, no checkout.

export const PAYMENT_TYPES = [
  "paypal",
  "venmo",
  "cashapp",
  "revolut",
  "wise",
  "upi",
  "bank",
  "bitcoin",
  "ethereum",
  "other",
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  paypal: "PayPal",
  venmo: "Venmo",
  cashapp: "Cash App",
  revolut: "Revolut",
  wise: "Wise",
  upi: "UPI",
  bank: "Bank transfer",
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  other: "Other",
};

/** Hints for the editor: what each method's link and details look like. */
export const PAYMENT_TYPE_HINTS: Record<
  PaymentType,
  { url: string; details: string }
> = {
  paypal: { url: "https://paypal.me/yourname", details: "" },
  venmo: { url: "https://venmo.com/u/yourname", details: "@yourname" },
  cashapp: { url: "https://cash.app/$yourname", details: "$yourname" },
  revolut: { url: "https://revolut.me/yourname", details: "" },
  wise: { url: "https://wise.com/pay/me/yourname", details: "" },
  upi: { url: "", details: "UPI ID: yourname@bank" },
  bank: {
    url: "",
    details: "Account name: Your name\nIBAN: GB33 BUKB 2020 1555 5555 55",
  },
  bitcoin: { url: "", details: "Wallet: bc1q..." },
  ethereum: { url: "", details: "Wallet: 0x..." },
  other: { url: "https://", details: "" },
};

export const MAX_PAYMENT_METHODS = 12;

const paymentMethodSchema = z
  .object({
    id: itemIdSchema,
    type: z.enum(PAYMENT_TYPES).default("other"),
    /** Shown instead of the method's name ("Tip the band") */
    label: lineText(60).default(""),
    /** The payment app's own page for you (paypal.me, cash.app, ...) */
    url: z.union([linkUrlSchema, z.literal("")]).default(""),
    /**
     * Details to copy, one per line. "Label: value" lines show the label
     * and copy only the value.
     */
    details: longText(600).default(""),
    note: lineText(160).default(""),
  })
  .refine((method) => method.url || method.details, {
    message: "Add a payment link or details to copy",
    path: ["url"],
  });

export const PAYMENT_ACTIONS = ["pay", "donate", "tip"] as const;

export const PAYMENT_ACTION_LABELS: Record<
  (typeof PAYMENT_ACTIONS)[number],
  string
> = { pay: "Pay", donate: "Donate", tip: "Tip" };

export const paymentSchema = z.object({
  title: lineText(120).default(""),
  /** The buttons' verb: "Pay with PayPal", "Donate with PayPal" */
  action: z.enum(PAYMENT_ACTIONS).default("pay"),
  methods: z.array(paymentMethodSchema).max(MAX_PAYMENT_METHODS).default([]),
  /** Under the methods: what the money is for, or how to confirm */
  note: longText(500).default(""),
});

export type PaymentProps = z.output<typeof paymentSchema>;
export type PaymentMethod = PaymentProps["methods"][number];

export interface DetailLine {
  label: string;
  value: string;
}

/** "IBAN: GB33 ..." → { label: "IBAN", value: "GB33 ..." }; other lines unlabeled. */
export function detailLines(details: string): DetailLine[] {
  return details
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([^:]{1,40}):\s+(.+)$/.exec(line);
      return match
        ? { label: (match[1] as string).trim(), value: match[2] as string }
        : { label: "", value: line };
    });
}
