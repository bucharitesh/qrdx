"use client";

import { cn } from "@repo/design-system/lib/utils";
import { ArrowSwapHorizontal } from "iconsax-reactjs";
import * as React from "react";
import { TypeIconTile } from "@/components/editor/content-type-icons";
import { ContentTypeModal } from "@/components/editor/content-type-modal";
import { useQREditorStore } from "@/store/editor-store";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";

/** Compact "current QR type" row at the top of the Content tab; opens the type picker. */
export function ContentTypeSelector({ className }: { className?: string }) {
  const contentType = useQREditorStore((state) => state.contentType);
  const [modalOpen, setModalOpen] = React.useState(false);

  const currentType = CONTENT_TYPES_METADATA.find(
    (meta) => meta.type === contentType,
  );

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={cn(
          "group bg-card flex w-full items-center gap-3 rounded-xl border p-2.5 pr-3 text-left transition-colors outline-none",
          "hover:border-foreground/15 hover:bg-accent/40 focus-visible:border-foreground/25 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
          className,
        )}
        onClick={() => setModalOpen(true)}
        type="button"
      >
        <TypeIconTile icon={currentType?.icon} type={currentType?.type} />
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-[11px] leading-4 font-medium tracking-wider uppercase">
            QR code type
          </span>
          <span className="block truncate text-sm leading-5 font-medium">
            {currentType?.label ?? "Choose a type"}
            {currentType && (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {currentType.description}
              </span>
            )}
          </span>
        </span>
        <span className="text-muted-foreground group-hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors">
          <ArrowSwapHorizontal className="size-3.5" />
          Change
        </span>
      </button>

      <ContentTypeModal onOpenChange={setModalOpen} open={modalOpen} />
    </>
  );
}
