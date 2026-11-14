"use client";

import {
  ChoiceField,
  ImageField,
  SelectField,
  TextField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { HeaderProps } from "./header";

const LAYOUTS: Array<{ value: HeaderProps["layout"]; label: string }> = [
  { value: "stack", label: "Stacked" },
  { value: "hero", label: "Photo with text over it" },
  { value: "banner", label: "Banner with overlapping photo" },
  { value: "split", label: "Photo beside the text" },
];

const COVER_HINTS: Record<HeaderProps["layout"], string> = {
  stack: "Wide banner shown above the photo (3:1).",
  hero: "Fills the top of the page with your text over it. A portrait or square photo works best.",
  banner: "Shown edge to edge at the top, fading into the page.",
  split: "Wide banner shown above the photo (3:1).",
};

export function HeaderEditor({
  value,
  onChange,
}: BlockEditorProps<HeaderProps>) {
  const set = (patch: Partial<HeaderProps>) => onChange({ ...value, ...patch });
  const needsCover =
    (value.layout === "hero" || value.layout === "banner") && !value.cover;
  return (
    <div className="space-y-4">
      <SelectField
        hint={needsCover ? "Add a cover image to use this layout." : undefined}
        label="Layout"
        onChange={(layout) => set({ layout })}
        options={LAYOUTS}
        value={value.layout}
      />
      <TextField
        hint="Optional, like Est. 2014 · Brooklyn."
        label="Small line above the title"
        maxLength={60}
        onChange={(eyebrow) => set({ eyebrow })}
        value={value.eyebrow}
      />
      <TextField
        label="Name or title"
        maxLength={80}
        onChange={(title) => set({ title })}
        value={value.title}
      />
      <ChoiceField
        label="Title size"
        onChange={(size) => set({ size })}
        options={[
          { value: "md", label: "Regular" },
          { value: "lg", label: "Large" },
          { value: "xl", label: "Extra large" },
        ]}
        value={value.size}
      />
      <TextField
        label="Bio"
        maxLength={300}
        multiline
        onChange={(subtitle) => set({ subtitle })}
        value={value.subtitle}
      />
      <ImageField
        label="Photo or logo"
        onChange={(avatar) => set({ avatar })}
        value={value.avatar}
      />
      {value.avatar && (
        <ChoiceField
          label="Photo shape"
          onChange={(avatarShape) => set({ avatarShape })}
          options={[
            { value: "circle", label: "Circle" },
            { value: "rounded", label: "Rounded" },
            { value: "square", label: "Square" },
          ]}
          value={value.avatarShape}
        />
      )}
      <ImageField
        hint={COVER_HINTS[value.layout]}
        label="Cover image"
        onChange={(cover) => set({ cover })}
        value={value.cover}
      />
      <ChoiceField
        label="Alignment"
        onChange={(align) => set({ align })}
        options={[
          { value: "center", label: "Center" },
          { value: "left", label: "Left" },
        ]}
        value={value.align}
      />
    </div>
  );
}
