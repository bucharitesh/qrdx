"use client";

import { newItemId } from "@/components/landing/block-kit";
import {
  ChoiceField,
  ImageField,
  ListEditor,
  SwitchField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import { BUTTON_STYLE_OPTIONS } from "./button-editor";
import type { LinkItem, LinksProps } from "./links";

// Mirrors MAX_LINKS in ./links (kept out of this client module's imports).
const MAX_LINKS = 50;

export function LinksEditor({ value, onChange }: BlockEditorProps<LinksProps>) {
  const set = (patch: Partial<LinksProps>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Section title"
        maxLength={80}
        onChange={(title) => set({ title })}
        placeholder="Optional"
        value={value.title}
      />
      <ListEditor<LinkItem>
        addLabel="Add link"
        create={() => ({
          id: newItemId(),
          label: "",
          url: "",
          description: "",
          featured: false,
        })}
        itemLabel={(item, index) => item.label || `Link ${index + 1}`}
        items={value.items}
        max={MAX_LINKS}
        onChange={(items) => set({ items })}
        renderItem={(item, update) => (
          <>
            <TextField
              label="Label"
              maxLength={80}
              onChange={(label) => update({ label })}
              value={item.label}
            />
            <UrlField
              allowActions
              label="Link"
              onChange={(url) => update({ url })}
              value={item.url}
            />
            <TextField
              label="Description"
              maxLength={140}
              onChange={(description) => update({ description })}
              placeholder="Optional"
              value={item.description}
            />
            <ImageField
              hint="Optional square image shown at the start of the button."
              label="Thumbnail"
              onChange={(thumbnail) => update({ thumbnail })}
              value={item.thumbnail}
            />
            <SwitchField
              checked={item.featured}
              label="Highlight this link"
              onChange={(featured) => update({ featured })}
            />
          </>
        )}
      />
      <ChoiceField
        label="Button style"
        onChange={(style) => set({ style })}
        options={BUTTON_STYLE_OPTIONS}
        value={value.style}
      />
      <SwitchField
        checked={value.icons}
        hint="Instagram, YouTube, WhatsApp and other known sites get their icon."
        label="Show site icons"
        onChange={(icons) => set({ icons })}
      />
    </div>
  );
}
