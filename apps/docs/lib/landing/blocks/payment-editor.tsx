"use client";

import { newItemId } from "@/components/landing/block-kit";
import {
  ChoiceField,
  ListEditor,
  SelectField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import {
  MAX_PAYMENT_METHODS,
  PAYMENT_ACTION_LABELS,
  PAYMENT_ACTIONS,
  PAYMENT_TYPE_HINTS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPES,
  type PaymentMethod,
  type PaymentProps,
} from "./payment-schema";

const TYPE_OPTIONS = PAYMENT_TYPES.map((type) => ({
  value: type,
  label: PAYMENT_TYPE_LABELS[type],
}));

export function PaymentEditor({
  value,
  onChange,
}: BlockEditorProps<PaymentProps>) {
  const set = (patch: Partial<PaymentProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Heading"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional, e.g. Ways to pay"
        value={value.title}
      />
      <ChoiceField
        label="Buttons say"
        onChange={(action) => set({ action })}
        options={PAYMENT_ACTIONS.map((action) => ({
          value: action,
          label: `${PAYMENT_ACTION_LABELS[action]} with…`,
        }))}
        value={value.action}
      />
      <ListEditor<PaymentMethod>
        addLabel="Add payment method"
        create={() => ({
          id: newItemId(),
          type: "paypal",
          label: "",
          url: "",
          details: "",
          note: "",
        })}
        itemLabel={(item) => item.label || PAYMENT_TYPE_LABELS[item.type]}
        items={value.methods}
        max={MAX_PAYMENT_METHODS}
        onChange={(methods) => set({ methods })}
        renderItem={(item, update) => {
          const hints = PAYMENT_TYPE_HINTS[item.type];
          return (
            <>
              <SelectField
                label="Method"
                onChange={(type) => update({ type })}
                options={TYPE_OPTIONS}
                value={item.type}
              />
              <UrlField
                hint="Your page in the payment app. Leave empty for details only."
                label="Payment link"
                onChange={(url) => update({ url })}
                placeholder={hints.url || "https://"}
                value={item.url}
              />
              <TextField
                hint={
                  'One per line. "Label: value" lines show the label and copy the value.'
                }
                label="Details to copy"
                maxLength={600}
                multiline
                onChange={(details) => update({ details })}
                placeholder={hints.details}
                rows={3}
                value={item.details}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Name shown"
                  maxLength={60}
                  onChange={(label) => update({ label })}
                  placeholder={PAYMENT_TYPE_LABELS[item.type]}
                  value={item.label}
                />
                <TextField
                  label="Note"
                  maxLength={160}
                  onChange={(note) => update({ note })}
                  placeholder="Optional"
                  value={item.note}
                />
              </div>
            </>
          );
        }}
      />
      <TextField
        hint="Shown under the methods, for example what the money is for."
        label="Note"
        maxLength={500}
        multiline
        onChange={(note) => set({ note })}
        rows={2}
        value={value.note}
      />
    </div>
  );
}
