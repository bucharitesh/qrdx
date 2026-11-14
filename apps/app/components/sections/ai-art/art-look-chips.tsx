"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { ART_LOOKS, type ArtLookId, artLookPreview } from "./looks";

interface ArtLookChipsProps {
  value: ArtLookId | null;
  onChange: (look: ArtLookId | null) => void;
  disabled?: boolean;
  /** Wrap onto more rows instead of scrolling sideways (wide forms) */
  wrap?: boolean;
  className?: string;
}

/**
 * Quick looks (./looks.ts): None plus a chip per look, each with a preview
 * of the same subject in that look. A look is added to the description, so
 * it works with any description, typed, picked or written.
 */
export function ArtLookChips({
  value,
  onChange,
  disabled,
  wrap,
  className,
}: ArtLookChipsProps) {
  const t = useTranslations("editor.art.artLooks");
  return (
    <div
      aria-label={t("lookChoices")}
      className={cn(
        "flex gap-1.5",
        wrap
          ? "flex-wrap"
          : "-mx-1 overflow-x-auto px-1 py-0.5 [mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%-24px),transparent)] [scrollbar-width:none]",
        className,
      )}
      role="toolbar"
    >
      <Chip
        active={value === null}
        disabled={disabled}
        label={t("none")}
        onClick={() => onChange(null)}
      />
      {ART_LOOKS.map((look) => (
        <Chip
          active={value === look.id}
          disabled={disabled}
          key={look.id}
          label={t(`looks.${look.id}`)}
          onClick={() => onChange(look.id)}
          preview={artLookPreview(look.id)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  preview,
  active,
  disabled,
  onClick,
}: {
  label: string;
  preview?: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "bg-background hover:border-foreground/30 flex h-8 shrink-0 items-center gap-1.5 rounded-full border text-xs whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
        preview ? "pr-3 pl-1" : "px-3",
        active && "border-foreground ring-foreground/15 font-medium ring-2",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {preview && (
        // Zoomed to the middle: at this size the corners are finder squares.
        <span
          aria-hidden
          className="bg-muted size-6 shrink-0 overflow-hidden rounded-full"
        >
          <img
            alt=""
            className="size-full scale-[1.8] object-cover"
            decoding="async"
            draggable={false}
            height={24}
            loading="lazy"
            src={preview}
            width={24}
          />
        </span>
      )}
      {label}
    </button>
  );
}
