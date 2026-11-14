"use client";
import { useTranslations } from "next-intl";

// The option buttons in the builder's footer, on the code options' data:
// each shows its plan, a lock when the workspace's plan doesn't include it,
// and a tick once it's set up.

import { Tick } from "@repo/design-system/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { Lock } from "iconsax-reactjs";
import {
  type CodeOptionsState,
  OPTION_ICONS,
} from "@/app/(app)/dashboard/codes/_components/code-options";
import {
  CODE_OPTION_COPY,
  type CodeKind,
  type CodeOptionId,
  codeOptionsFor,
} from "@/app/(app)/dashboard/codes/_lib/code-options";
import { PLAN_NAMES } from "@/lib/pricing";
import { OPTION_KEYS } from "./shortcuts";

export function BuilderOptionBar({
  kind,
  options,
  active,
  onSelect,
  disabled,
  showKeys,
}: {
  kind: CodeKind;
  options: CodeOptionsState;
  /** The option whose panel is open */
  active: CodeOptionId | null;
  onSelect: (id: CodeOptionId) => void;
  disabled?: boolean;
  /** Keyboard shortcuts are on (user settings) */
  showKeys: boolean;
}) {
  const t = useTranslations("codeBuilder.builderOptions");
  return (
    <ul
      aria-label={t("options")}
      // Scrolls sideways when the buttons don't fit; the right edge fades
      // so the cut-off button reads as "more", like the catalog's chips.
      className="flex min-w-0 gap-1.5 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] max-md:-mx-4 max-md:px-4"
    >
      {codeOptionsFor(kind).map((id) => {
        const Icon = OPTION_ICONS[id];
        const copy = CODE_OPTION_COPY[id];
        const access = options.plans?.options[id];
        const locked = Boolean(access?.requiredPlan && !access.included);
        const on = Boolean(options.status[id]);
        const key = OPTION_KEYS[id].toUpperCase();
        return (
          <li className="shrink-0" key={id}>
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <button
                  aria-keyshortcuts={showKeys ? key : undefined}
                  aria-pressed={active === id}
                  className={cn(
                    "hover:bg-muted/70 focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
                    active === id && "bg-muted border-foreground/30",
                  )}
                  disabled={disabled || !options.plans}
                  onClick={() => onSelect(id)}
                  type="button"
                >
                  <Icon
                    aria-hidden
                    className="text-muted-foreground size-3.5"
                  />
                  {copy.label}
                  {on && (
                    <>
                      <Tick className="size-3" />
                      <span className="sr-only">{t("on")}</span>
                    </>
                  )}
                  {locked && access?.requiredPlan && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 text-[10px] leading-4 font-medium">
                      <Lock aria-hidden className="size-2.5" />
                      {PLAN_NAMES[access.requiredPlan]}
                      <span className="sr-only">{t("notOnYourPlan")}</span>
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              {/* Above the code builder's dialog (z-[99]) */}
              <TooltipContent className="z-[120]" side="top">
                {copy.blurb}
                {access?.requiredPlan &&
                  !locked &&
                  ` · ${PLAN_NAMES[access.requiredPlan]}`}
                {showKeys && <span className="ml-1.5 opacity-70">{key}</span>}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** "On:" chips for the options a code has set up; each opens its panel. */
export function BuilderOptionsOn({
  kind,
  options,
  onSelect,
}: {
  kind: CodeKind;
  options: CodeOptionsState;
  onSelect: (id: CodeOptionId) => void;
}) {
  const t = useTranslations("codeBuilder.builderOptions");
  const on = codeOptionsFor(kind).filter((id) => options.status[id]);
  if (on.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{t("on2")}</span>
      {on.map((id) => {
        const Icon = OPTION_ICONS[id];
        return (
          <button
            className="hover:bg-muted/70 inline-flex h-6 items-center gap-1 rounded-md border px-2 font-medium transition-colors"
            key={id}
            onClick={() => onSelect(id)}
            type="button"
          >
            <Icon aria-hidden className="text-muted-foreground size-3" />
            {CODE_OPTION_COPY[id].label}
          </button>
        );
      })}
    </div>
  );
}
