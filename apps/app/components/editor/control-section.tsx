"use client";

import { Kbd } from "@repo/design-system/components/ui/kbd";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, ArrowRight2 } from "iconsax-reactjs";
import type * as React from "react";
import { useEffect, useId, useState } from "react";
import { InfoHint } from "@/components/help/info-hint";
import type { HintId } from "@/lib/help/hints";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import type { ControlSectionProps } from "@/types";
import { SidePanel } from "./control-sections/side-panel";
import { SectionContext } from "./section-context";

/** The anchor of a section a link can open (?section=<id>): `section-<id>`. */
export const sectionAnchorId = (section: string) => `section-${section}`;

interface Props extends ControlSectionProps {
  /** Shown on the right of the header while collapsed (current value) */
  summary?: React.ReactNode;
  /** Anchor id, e.g. to scroll a section into view */
  id?: string;
  /**
   * A section a playground link can open (DESIGN_SECTIONS in
   * lib/playground-links.ts): its anchor becomes `section-<id>`.
   */
  section?: string;
  /** Optional one-line help under the title while expanded */
  description?: string;
  /** Info (i) next to the title; content lives in lib/help/hints.ts */
  hint?: HintId;
  /**
   * Opens beside the panel (a bottom sheet on phones) instead of expanding
   * in place: for the shape sections, so the preview stays in view.
   */
  popover?: boolean;
}

/**
 * Accordion row for the editor's design panel. Sections stack with hairline
 * dividers and read top to bottom; collapsed ones show their current value.
 */
function ControlSection({
  title,
  children,
  expanded = false,
  className,
  kbd,
  summary,
  id,
  section,
  description,
  hint,
  popover = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const { settings } = useUserSettings();
  const showKbd = kbd && (settings?.keyboardShortcuts ?? true);
  const contentId = useId();

  // Open when a parent asks for it later (e.g. jumping to "Logo").
  useEffect(() => {
    if (expanded) setIsExpanded(true);
  }, [expanded]);

  return (
    <SectionContext.Provider
      value={{
        isExpanded,
        setIsExpanded,
        toggleExpanded: () => setIsExpanded((prev) => !prev),
      }}
    >
      <section
        className="scroll-mt-2 border-b last:border-b-0"
        data-section={section}
        id={id ?? (section ? sectionAnchorId(section) : undefined)}
      >
        <div className="group/header relative">
          <h3>
            {popover ? (
              <SidePanel
                onOpenChange={setIsExpanded}
                open={isExpanded}
                title={title}
                trigger={
                  <button
                    aria-expanded={isExpanded}
                    aria-haspopup="dialog"
                    className="hover:bg-accent/30 group-hover/header:bg-accent/30 focus-visible:bg-accent/40 aria-expanded:bg-accent/40 flex w-full items-center gap-2 px-4 py-3 text-left transition-colors outline-none"
                    type="button"
                  >
                    <span className="text-sm font-medium">{title}</span>
                    {hint && <span aria-hidden className="size-4 shrink-0" />}
                    {showKbd && <Kbd>{kbd}</Kbd>}
                    <span className="text-muted-foreground ml-auto flex min-w-0 items-center gap-2 truncate text-xs">
                      {summary}
                    </span>
                    <ArrowRight2
                      aria-hidden
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  </button>
                }
              >
                <div className={cn("space-y-4 pt-0.5", className)}>
                  {description && (
                    <p className="text-muted-foreground -mt-1 text-xs text-pretty">
                      {description}
                    </p>
                  )}
                  {children}
                </div>
              </SidePanel>
            ) : (
              <button
                aria-controls={contentId}
                aria-expanded={isExpanded}
                className="hover:bg-accent/30 group-hover/header:bg-accent/30 focus-visible:bg-accent/40 flex w-full items-center gap-2 px-4 py-3 text-left transition-colors outline-none"
                onClick={() => setIsExpanded((prev) => !prev)}
                type="button"
              >
                <span className="text-sm font-medium">{title}</span>
                {hint && <span aria-hidden className="size-4 shrink-0" />}
                {showKbd && <Kbd>{kbd}</Kbd>}
                <span
                  className={cn(
                    "text-muted-foreground ml-auto flex min-w-0 items-center gap-2 truncate text-xs transition-opacity",
                    isExpanded && "opacity-0",
                  )}
                >
                  {summary}
                </span>
                <ArrowDown2
                  className={cn(
                    "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-180",
                  )}
                />
              </button>
            )}
          </h3>
          {hint && (
            // Lies over the header (a button can't hold another button) and
            // lines the (i) up with the spacer after the title.
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2 px-4">
              <span aria-hidden className="invisible text-sm font-medium">
                {title}
              </span>
              <InfoHint className="pointer-events-auto" id={hint} />
            </span>
          )}
        </div>
        {!popover && (
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
            id={contentId}
            inert={!isExpanded}
            style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className={cn("space-y-4 px-4 pt-0.5 pb-5", className)}>
                {description && (
                  <p className="text-muted-foreground -mt-1 text-xs text-pretty">
                    {description}
                  </p>
                )}
                {children}
              </div>
            </div>
          </div>
        )}
      </section>
    </SectionContext.Provider>
  );
}

export default ControlSection;
