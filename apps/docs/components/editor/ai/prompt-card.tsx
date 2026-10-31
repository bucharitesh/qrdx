"use client";

import { cn } from "@repo/design-system/lib/utils";
import { QRCodeSVG } from "qrdx";
import type { ThemeStyles } from "@/types/theme";
import { ShineBorder } from "./shine-border";

/** A rich AI suggestion: a mini live preview in its colours, a title and a hint. */
export function PromptCard({
  title,
  hint,
  preview,
  onClick,
  disabled,
  className,
}: {
  title: string;
  hint?: string;
  preview: Partial<ThemeStyles>;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "group bg-card/60 relative isolate flex min-w-0 items-center gap-3 rounded-lg border p-2 pr-3 text-left outline-none",
        "transition-[transform,background-color,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-transparent hover:bg-card focus-visible:border-transparent focus-visible:bg-card active:scale-[0.98] motion-reduce:transform-none",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <ShineBorder className="opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white p-0.5 shadow-xs ring-1 ring-black/10 [&_svg]:size-full">
        <QRCodeSVG
          bgColor={preview.bgColor}
          bodyPattern={preview.bodyPattern}
          cornerEyeDotPattern={preview.cornerEyeDotPattern}
          cornerEyePattern={preview.cornerEyePattern}
          dotColor={preview.dotColor}
          eyeColor={preview.eyeColor}
          fgColor={preview.fgColor}
          level="L"
          margin={1}
          size={44}
          value="qrdx.dev"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm leading-5 font-medium">
          {title}
        </span>
        {hint && (
          <span className="text-muted-foreground block truncate text-xs leading-4">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
