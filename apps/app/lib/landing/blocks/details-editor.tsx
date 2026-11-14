"use client";

import { newItemId } from "@/components/landing/block-kit";
import {
  ChoiceField,
  ListEditor,
  TextField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import {
  type DetailItem,
  type DetailsProps,
  MAX_DETAILS,
} from "./details-schema";

export function DetailsEditor({
  value,
  onChange,
}: BlockEditorProps<DetailsProps>) {
  const set = (patch: Partial<DetailsProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Heading"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional"
        value={value.title}
      />
      <ListEditor<DetailItem>
        addLabel="Add detail"
        create={() => ({ id: newItemId(), label: "", value: "" })}
        itemLabel={(item, index) => item.label || `Detail ${index + 1}`}
        items={value.items}
        max={MAX_DETAILS}
        onChange={(items) => set({ items })}
        renderItem={(item, update) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Label"
              maxLength={60}
              onChange={(label) => update({ label })}
              placeholder="Bedrooms"
              value={item.label}
            />
            <TextField
              hint={item.value ? undefined : "Empty details are hidden"}
              label="Value"
              maxLength={200}
              onChange={(next) => update({ value: next })}
              placeholder="3"
              value={item.value}
            />
          </div>
        )}
      />
      <ChoiceField
        label="Layout"
        onChange={(layout) => set({ layout })}
        options={[
          { value: "rows", label: "List" },
          { value: "tiles", label: "Tiles" },
        ]}
        value={value.layout}
      />
    </div>
  );
}
