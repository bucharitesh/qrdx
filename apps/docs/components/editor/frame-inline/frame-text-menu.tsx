"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Warning2 } from "iconsax-reactjs";
import { getContrastRatio } from "qrdx";
import { useEffect, useId, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { IconPicker } from "../control-sections/custom-frame-fields";
import type { FrameTweak, FrameTweaks } from "./frame-text-fields";

// The controls the inline menu and the phone sheet share: color with its
// contrast warning, and the frame's icons. Text size reuses FrameTextSize.

/** WCAG AA for text, the bar the editor's contrast checker uses. */
export const MIN_LABEL_CONTRAST = 4.5;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Contrast of the label's drawn color against what's painted behind it. */
export function labelContrast(
  fill: string,
  behind: string | null,
): number | null {
  return behind ? getContrastRatio(fill, behind) : null;
}

/** "Low contrast" line, shown under a color when the label may be hard to read. */
export function ContrastNote({ ratio }: { ratio: number | null }) {
  if (ratio === null || ratio >= MIN_LABEL_CONTRAST) return null;
  return (
    <p
      className="text-muted-foreground flex items-start gap-1.5 text-xs"
      role="status"
    >
      <Warning2 aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        Low contrast ({ratio.toFixed(1)}:1). The text may be hard to read; aim
        for {MIN_LABEL_CONTRAST}:1.
      </span>
    </p>
  );
}

/** The editor's color picker: a hue/saturation field and a hex input. */
export function ColorEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-2">
      <HexColorPicker
        aria-label={label}
        className="h-36! w-full!"
        color={value}
        onChange={onChange}
      />
      <div className="flex items-center gap-2">
        <Label className="sr-only" htmlFor={id}>
          {label} hex
        </Label>
        <span
          aria-hidden
          className="size-7 shrink-0 rounded-full border shadow-xs"
          style={{ backgroundColor: value }}
        />
        <Input
          className="h-8 flex-1 font-mono text-sm"
          id={id}
          maxLength={7}
          onBlur={() => setDraft(value)}
          onChange={(event) => {
            setDraft(event.target.value);
            if (HEX_COLOR.test(event.target.value)) {
              onChange(event.target.value);
            }
          }}
          placeholder="#000000"
          value={draft}
        />
      </div>
    </div>
  );
}

/** One picker per icon the frame places (Christmas has a tree and a sparkle). */
export function IconsEditor({
  icons,
  onTweak,
}: {
  icons: FrameTweaks["icons"];
  onTweak: (tweak: FrameTweak) => void;
}) {
  return (
    <div className="space-y-3">
      {icons.map((icon) => (
        <IconPicker
          current={icon}
          key={icon}
          onPick={(next) => onTweak({ kind: "icon", from: icon, to: next })}
          taken={icons.filter((other) => other !== icon)}
        />
      ))}
    </div>
  );
}
