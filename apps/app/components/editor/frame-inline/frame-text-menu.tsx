"use client";

import { Warning2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { getContrastRatio } from "qrdx";
import { IconPicker } from "../control-sections/custom-frame-fields";
import { PaintPanel } from "../paint-picker/paint-panel";
import type { FrameTweak, FrameTweaks } from "./frame-text-fields";

// The controls the inline menu and the phone sheet share: color with its
// contrast warning, and the frame's icons. Text size reuses FrameTextSize.

/** WCAG AA for text, the bar the editor's contrast checker uses. */
export const MIN_LABEL_CONTRAST = 4.5;

/** Contrast of the label's drawn color against what's painted behind it. */
export function labelContrast(
  fill: string,
  behind: string | null,
): number | null {
  return behind ? getContrastRatio(fill, behind) : null;
}

/** "Low contrast" line, shown under a color when the label may be hard to read. */
export function ContrastNote({ ratio }: { ratio: number | null }) {
  const t = useTranslations("editor.frameInline.frameTextMenu");
  if (ratio === null || ratio >= MIN_LABEL_CONTRAST) return null;
  return (
    <p
      className="text-muted-foreground flex items-start gap-1.5 text-xs"
      role="status"
    >
      <Warning2 aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        {t("lowContrastValue1The", {
          value: ratio.toFixed(1),
          MIN_LABEL_CONTRAST,
        })}
      </span>
    </p>
  );
}

/**
 * The editor's paint picker, solid and opaque: frame text and frame colors
 * are stored as "#rrggbb" and take no gradient or image.
 */
export function ColorEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <section aria-label={label}>
      <PaintPanel
        alpha={false}
        onChange={(next) => {
          const color =
            typeof next === "string"
              ? next
              : next.type === "solid"
                ? next.color
                : null;
          if (color) onChange(color);
        }}
        value={value}
      />
    </section>
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
