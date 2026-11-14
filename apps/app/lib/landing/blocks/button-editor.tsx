"use client";

import {
  ChoiceField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { ButtonProps } from "./button";

export const BUTTON_STYLE_OPTIONS = [
  { value: "filled", label: "Filled" },
  { value: "outline", label: "Outline" },
  { value: "soft", label: "Soft" },
] as const;

export function ButtonEditor({
  value,
  onChange,
}: BlockEditorProps<ButtonProps>) {
  const set = (patch: Partial<ButtonProps>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Label"
        maxLength={80}
        onChange={(label) => set({ label })}
        value={value.label}
      />
      <UrlField
        allowActions
        hint="A web link, an email address or a phone number."
        label="Link"
        onChange={(url) => set({ url })}
        value={value.url}
      />
      <ChoiceField
        label="Style"
        onChange={(style) => set({ style })}
        options={BUTTON_STYLE_OPTIONS}
        value={value.style}
      />
      <TextField
        label="Note under the button"
        maxLength={160}
        onChange={(note) => set({ note })}
        placeholder="Optional, e.g. Opens in Google Maps"
        value={value.note}
      />
    </div>
  );
}
