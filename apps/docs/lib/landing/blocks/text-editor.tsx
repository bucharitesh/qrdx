"use client";

import {
  ChoiceField,
  SwitchField,
  TextField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { TextProps } from "./text";

export function TextEditor({ value, onChange }: BlockEditorProps<TextProps>) {
  const set = (patch: Partial<TextProps>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Heading"
        maxLength={120}
        onChange={(heading) => set({ heading })}
        value={value.heading}
      />
      <TextField
        hint="Line breaks are kept."
        label="Text"
        maxLength={5000}
        multiline
        onChange={(body) => set({ body })}
        rows={5}
        value={value.body}
      />
      <div className="grid grid-cols-2 gap-3">
        <ChoiceField
          label="Alignment"
          onChange={(align) => set({ align })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
          ]}
          value={value.align}
        />
        <ChoiceField
          label="Size"
          onChange={(size) => set({ size })}
          options={[
            { value: "sm", label: "S" },
            { value: "md", label: "M" },
            { value: "lg", label: "L" },
          ]}
          value={value.size}
        />
      </div>
      <SwitchField
        checked={value.card}
        label="Show on a card"
        onChange={(card) => set({ card })}
      />
    </div>
  );
}
