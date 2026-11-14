"use client";

import { ChoiceField, TextField } from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { DividerProps } from "./divider";

export function DividerEditor({
  value,
  onChange,
}: BlockEditorProps<DividerProps>) {
  return (
    <div className="space-y-4">
      <ChoiceField
        label="Line"
        onChange={(style) => onChange({ ...value, style })}
        options={[
          { value: "solid", label: "Solid" },
          { value: "dashed", label: "Dashed" },
          { value: "dotted", label: "Dotted" },
          { value: "ornament", label: "Ornament" },
        ]}
        value={value.style}
      />
      <TextField
        label="Label"
        maxLength={40}
        onChange={(label) => onChange({ ...value, label })}
        placeholder="Optional, e.g. Follow us"
        value={value.label}
      />
    </div>
  );
}
