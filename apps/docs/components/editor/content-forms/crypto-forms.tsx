"use client";

// Payment requests for Litecoin, Dogecoin, Bitcoin Cash, Solana (Solana Pay)
// and Monero: one wallet address, an optional amount and descriptions.

import type { z } from "zod";
import {
  bitcoincashSchema,
  dogecoinSchema,
  litecoinSchema,
  moneroSchema,
  solanaSchema,
} from "@/lib/validations/qr-content";
import type { ContentType } from "@/types/qr-content";
import { type FormField, SchemaForm } from "./schema-form";

function cryptoFields(
  ticker: string,
  addressHint: string,
  labelName = "Label",
  messageName = "Message",
): FormField[] {
  return [
    {
      name: "address",
      label: "Wallet address",
      required: true,
      placeholder: addressHint,
      mono: true,
    },
    {
      name: "amount",
      label: `Amount (${ticker})`,
      placeholder: "Leave empty to let the payer choose",
      inputMode: "decimal",
    },
    {
      name: "label",
      label: labelName,
      placeholder: "Who gets paid, like a shop name",
    },
    {
      name: "message",
      label: messageName,
      placeholder: "What the payment is for",
    },
  ];
}

function CryptoForm({
  type,
  schema,
  fields,
  wallet,
}: {
  type: ContentType;
  schema: z.ZodType;
  fields: FormField[];
  wallet: string;
}) {
  return (
    <SchemaForm
      fields={fields}
      note={`Scanning opens a ${wallet} with this payment request. Check the address twice: crypto payments can't be reversed.`}
      schema={schema}
      type={type}
    />
  );
}

const LITECOIN_FIELDS = cryptoFields("LTC", "ltc1q… or L…");
const DOGECOIN_FIELDS = cryptoFields("DOGE", "D…");
const BITCOINCASH_FIELDS = cryptoFields("BCH", "q… (CashAddr)");
const SOLANA_FIELDS = cryptoFields("SOL", "Solana address");
const MONERO_FIELDS = cryptoFields(
  "XMR",
  "4… or 8…",
  "Recipient name",
  "Description",
);

export function LitecoinForm() {
  return (
    <CryptoForm
      fields={LITECOIN_FIELDS}
      schema={litecoinSchema}
      type="litecoin"
      wallet="Litecoin wallet"
    />
  );
}

export function DogecoinForm() {
  return (
    <CryptoForm
      fields={DOGECOIN_FIELDS}
      schema={dogecoinSchema}
      type="dogecoin"
      wallet="Dogecoin wallet"
    />
  );
}

export function BitcoinCashForm() {
  return (
    <CryptoForm
      fields={BITCOINCASH_FIELDS}
      schema={bitcoincashSchema}
      type="bitcoincash"
      wallet="Bitcoin Cash wallet"
    />
  );
}

export function SolanaForm() {
  return (
    <CryptoForm
      fields={SOLANA_FIELDS}
      schema={solanaSchema}
      type="solana"
      wallet="Solana Pay wallet"
    />
  );
}

export function MoneroForm() {
  return (
    <CryptoForm
      fields={MONERO_FIELDS}
      schema={moneroSchema}
      type="monero"
      wallet="Monero wallet"
    />
  );
}
