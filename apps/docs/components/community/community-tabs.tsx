import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";

export type CommunityTab = "home" | "frames" | "themes" | "collections";

const TABS: { id: CommunityTab; label: string; href: string }[] = [
  { id: "home", label: "Overview", href: "/community" },
  { id: "frames", label: "Frames", href: "/community/frames" },
  { id: "themes", label: "Themes", href: "/community/themes" },
  { id: "collections", label: "Collections", href: "/community/collections" },
];

/** The community's type tabs (links, so every view has a URL). */
export function CommunityTabs({
  active,
  showCollections = true,
}: {
  active: CommunityTab;
  showCollections?: boolean;
}) {
  return (
    <nav aria-label="Community" className="border-b">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {TABS.filter((tab) => showCollections || tab.id !== "collections").map(
          (tab) => (
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
          ),
        )}
      </div>
    </nav>
  );
}
