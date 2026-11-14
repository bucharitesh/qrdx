"use client";

import { SliderField } from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { SpacerProps } from "./spacer";

export function SpacerEditor({
  value,
  onChange,
}: BlockEditorProps<SpacerProps>) {
  return (
    <SliderField
      label="Height"
      max={160}
      min={4}
      onChange={(size) => onChange({ ...value, size })}
      step={4}
      unit="px"
      value={value.size}
    />
  );
}
