import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import {
  CODE_TAB_LABELS,
  CODE_TABS,
  type CodeTab,
  codeTabHref,
} from "@/app/(app)/dashboard/codes/_lib/code-tabs";

/** Overview · Analytics · Settings. Each tab is its own URL. */
export function CodeTabsNav({
  slug,
  codeId,
  current,
}: {
  /** The workspace's slug */
  slug: string;
  codeId: string;
  current: CodeTab;
}) {
  return (
    <nav aria-label="Code sections" className="border-b">
      <ul className="-mb-px flex gap-5">
        {CODE_TABS.map((tab) => {
          const active = tab === current;
          return (
            <li key={tab}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 inline-flex h-10 items-center border-b-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]",
                  active
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
                href={codeTabHref(slug, codeId, tab)}
                scroll={false}
              >
                {CODE_TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
