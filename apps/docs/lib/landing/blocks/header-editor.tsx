"use client";

import {
  ChoiceField,
  ImageField,
  TextField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { HeaderProps } from "./header";

export function HeaderEditor({
  value,
  onChange,
}: BlockEditorProps<HeaderProps>) {
  const set = (patch: Partial<HeaderProps>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Name or title"
        maxLength={80}
        onChange={(title) => set({ title })}
        value={value.title}
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
        hint="Wide banner shown above the photo (3:1)."
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
