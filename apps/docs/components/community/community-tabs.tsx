import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";

export type CommunityTab =
  | "home"
  | "frames"
  | "themes"
  | "collections"
  | "templates"
  | "kits";

const TABS: { id: CommunityTab; label: string; href: string }[] = [
  { id: "home", label: "Overview", href: "/community" },
  { id: "frames", label: "Frames", href: "/community/frames" },
  { id: "themes", label: "Themes", href: "/community/themes" },
  { id: "collections", label: "Collections", href: "/community/collections" },
  { id: "templates", label: "Page templates", href: "/community/templates" },
  { id: "kits", label: "Kits", href: "/community/kits" },
];

/** The community's type tabs (links, so every view has a URL). */
export function CommunityTabs({
  active,
  showCollections = true,
  showTemplates = false,
  showKits = false,
  wide = false,
}: {
  active: CommunityTab;
  /**
   * Rail to rail, lined up with the galleries' sidebar (the galleries);
   * otherwise centred like the overview's rows.
   */
  wide?: boolean;
  showCollections?: boolean;
  /** Shown once a page template is published (or on its own page) */
  showTemplates?: boolean;
  /** Shown once a kit is published (or on its own page) */
  showKits?: boolean;
}) {
  return (
    <nav aria-label="Community" className="border-b">
      <div
        className={cn(
          "no-scrollbar flex gap-1 overflow-x-auto",
          wide ? "mx-6 px-1 sm:px-3" : "mx-auto max-w-6xl px-4 sm:px-6",
        )}
      >
        {TABS.filter(
          (tab) =>
            (showCollections || tab.id !== "collections") &&
            (showTemplates ||
              active === "templates" ||
              tab.id !== "templates") &&
            (showKits || active === "kits" || tab.id !== "kits"),
        ).map((tab) => (
          <Link
            aria-current={tab.id === active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              tab.id === active
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
            href={tab.href}
            key={tab.id}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
