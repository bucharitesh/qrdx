"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { useId } from "react";
import {
  ChoiceField,
  FieldRow,
  SwitchField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import { barcodeError } from "./coupon-barcode";
import type { CouponProps } from "./coupon-schema";

function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  const id = useId();
  return (
    <FieldRow htmlFor={id} label={label}>
      <Input
        id={id}
        min={min || undefined}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </FieldRow>
  );
}

export function CouponEditor({
  value,
  onChange,
}: BlockEditorProps<CouponProps>) {
  const set = (patch: Partial<CouponProps>) => onChange({ ...value, ...patch });
  const barcodeIssue =
    value.barcode === "none"
      ? null
      : barcodeError(value.barcode, (value.barcodeValue || value.code).trim());

  return (
    <div className="space-y-4">
      <TextField
        label="Headline"
        maxLength={80}
        onChange={(headline) => set({ headline })}
        placeholder="20% off your next order"
        value={value.headline}
      />
      <TextField
        label="Description"
        maxLength={500}
        multiline
        onChange={(description) => set({ description })}
        rows={2}
        value={value.description}
      />
      <TextField
        label="Coupon code"
        maxLength={48}
        onChange={(code) => set({ code })}
        placeholder="WELCOME20"
        value={value.code}
      />
      <ChoiceField
        label="Barcode"
        onChange={(barcode) => set({ barcode })}
        options={[
          { value: "none", label: "None" },
          { value: "code128", label: "Code 128" },
          { value: "ean13", label: "EAN-13" },
        ]}
        value={value.barcode}
      />
      {value.barcode !== "none" && (
        <TextField
          hint={
            barcodeIssue ??
            (value.barcode === "ean13"
              ? "12 digits (the check digit is added) or all 13."
              : "Leave empty to encode the coupon code.")
          }
          label="Barcode value"
          maxLength={48}
          onChange={(barcodeValue) => set({ barcodeValue })}
          placeholder={value.code}
          value={value.barcodeValue}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <DateField
          label="Valid from"
          onChange={(validFrom) => set({ validFrom })}
          value={value.validFrom}
        />
        <DateField
          label="Valid until"
          min={value.validFrom}
          onChange={(validUntil) => set({ validUntil })}
          value={value.validUntil}
        />
      </div>
      <TextField
        label="Terms and conditions"
        maxLength={2000}
        multiline
        onChange={(terms) => set({ terms })}
        rows={3}
        value={value.terms}
      />
      <SwitchField
        checked={value.redeemable}
        hint="Visitors tap Redeem at the counter; redemptions are counted on the page's Responses screen. It can't stop the same code being used on another phone."
        label="Redeem button"
        onChange={(redeemable) => set({ redeemable })}
      />
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-xs font-medium">Button (optional)</p>
        <TextField
          label="Label"
          maxLength={40}
          onChange={(label) =>
            set({
              cta:
                label || value.cta?.url
                  ? { label, url: value.cta?.url ?? "" }
                  : undefined,
            })
          }
          placeholder="Shop online"
          value={value.cta?.label}
        />
        <UrlField
          label="Link"
          onChange={(url) =>
            set({
              cta:
                url || value.cta?.label
                  ? { label: value.cta?.label ?? "", url }
                  : undefined,
            })
          }
          value={value.cta?.url}
        />
      </div>
    </div>
  );
}
