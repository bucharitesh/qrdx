"use client";

import { NavigationMenuLink } from "@repo/design-system/components/ui/navigation-menu";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, ExportSquare } from "iconsax-reactjs";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import type { HeaderNavItem } from "./header-nav";
import { NavArt, type NavArtKind } from "./header-nav-art";
import styles from "./header-nav-panel.module.css";

/** Put on the NavigationMenu root: styles the shared panel it renders into. */
export const navPanelRootClass = styles.root;

/** Which artwork a featured card shows, by its destination. */
const ART: Record<string, NavArtKind> = {
  "/playground": "design",
  "/qr-code-generator": "generators",
  "/docs": "code",
};

const externalProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

function NavIconTile({ icon: Icon }: { icon: HeaderNavItem["icon"] }) {
  return (
    <span
      className={cn(styles.tile, "grid size-9 shrink-0 place-items-center")}
    >
      <Icon aria-hidden className="size-[18px] text-current" />
    </span>
  );
}

/**
 * One dropdown: an optional featured card on the left, the other items as
 * icon rows (two columns when there is no featured card) and an optional
 * footer link to the group's hub. Its links don't prefetch: opening a menu
 * would fetch every destination's code at once.
 */
export function NavPanel({
  items,
  pathname,
}: {
  items: HeaderNavItem[];
  pathname: string;
}) {
  const featured = items.find((item) => item.featured);
  const hub = items.find((item) => item.hub);
  const rows = items.filter((item) => !item.featured && !item.hub);

  return (
    <div className={cn("flex flex-col", featured ? "w-[38rem]" : "w-[32rem]")}>
      <ul
        className={cn(
          "grid gap-1",
          featured ? "grid-cols-[15rem_minmax(0,1fr)]" : "grid-cols-2",
        )}
      >
        {featured && (
          <li className="flex" style={{ gridRow: `span ${rows.length}` }}>
            <FeaturedLink item={featured} pathname={pathname} />
          </li>
        )}
        {rows.map((item) => (
          <li key={item.href} className={cn(featured && "col-start-2")}>
            <NavRow item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
      {hub && (
        <div className={cn(styles.rule, "mt-1 border-t pt-1")}>
          <NavigationMenuLink
            asChild
            active={pathname === hub.href}
            className={cn(
              styles.item,
              "group/nav-item flex-row items-center gap-2 px-3 py-2.5",
            )}
          >
            <Link href={hub.href} prefetch={false}>
              <span className="text-sm font-medium text-foreground">
                {hub.name}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {hub.description}
              </span>
              <ArrowRight
                aria-hidden
                className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/nav-item:translate-x-0.5 group-focus-visible/nav-item:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </NavigationMenuLink>
        </div>
      )}
    </div>
  );
}

function NavRow({ item, pathname }: { item: HeaderNavItem; pathname: string }) {
  const external = Boolean(item.external);
  const current = !external && pathname === item.href;

  return (
    <NavigationMenuLink
      asChild
      active={current}
      className={cn(
        styles.item,
        "group/nav-item flex-row items-center gap-3 p-2.5",
      )}
    >
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        prefetch={false}
        {...(external && externalProps)}
      >
        <NavIconTile icon={item.icon} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1 text-sm font-medium leading-tight text-foreground">
            {item.name}
            {external && (
              <ExportSquare
                aria-hidden
                className="size-3 text-muted-foreground"
              />
            )}
          </span>
          <span className="text-xs leading-snug text-muted-foreground text-pretty">
            {item.description}
          </span>
        </span>
      </Link>
    </NavigationMenuLink>
  );
}

function FeaturedLink({
  item,
  pathname,
}: {
  item: HeaderNavItem;
  pathname: string;
}) {
  const current = pathname === item.href;

  return (
    <NavigationMenuLink
      asChild
      active={current}
      className={cn(
        styles.item,
        styles.feature,
        "group/nav-item w-full gap-0 overflow-hidden p-0",
      )}
    >
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        prefetch={false}
      >
        <span className="flex min-h-32 flex-1 items-center justify-center p-3.5">
          <NavArt kind={ART[item.href] ?? "design"} />
        </span>
        <span className="flex flex-col gap-1 px-4 pb-4">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {item.name}
            <ArrowRight
              aria-hidden
              className="size-3.5 text-muted-foreground transition-transform duration-150 group-hover/nav-item:translate-x-0.5 group-focus-visible/nav-item:translate-x-0.5 motion-reduce:transition-none"
            />
          </span>
          <span className="text-xs leading-relaxed text-muted-foreground text-pretty">
            {item.description}
          </span>
        </span>
      </Link>
    </NavigationMenuLink>
  );
}
