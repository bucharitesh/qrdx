"use client";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@repo/design-system/components/ui/navigation-menu";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, ExportSquare } from "iconsax-reactjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ComponentType,
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import { AsciiField } from "@/components/fx";
import { siteConfig } from "@/config/site";
import styles from "./header-nav.module.css";

export interface HeaderNavItem {
  name: string;
  href: string;
  description: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  external?: boolean;
  /** Shown as the large panel on the left of the dropdown. */
  featured?: boolean;
  /** The group's hub page: the footer link of the dropdown. */
  hub?: boolean;
}

export interface HeaderNavEntry {
  id: number;
  name: string;
  href: string;
  items?: HeaderNavItem[];
}

export const headerNavEntries: HeaderNavEntry[] = siteConfig.nav.links;

const isExternal = (item: HeaderNavItem) => Boolean(item.external);

const externalProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/** R4 icon tile; lifts to the card background when its row is hovered. */
export function NavIconTile({
  icon: Icon,
  className,
}: {
  icon: HeaderNavItem["icon"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40 transition-colors duration-150 group-hover/nav-item:bg-background group-focus-visible/nav-item:bg-background",
        className,
      )}
    >
      <Icon aria-hidden className="size-4 text-foreground/80" />
    </span>
  );
}

/** True when `pathname` is `href` or a page below it. */
export function matchesPath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The top-level entry the current page belongs to, if any. */
export function getActiveEntryId(pathname: string): number | undefined {
  // The most specific link wins (longest matching href), so a page is active
  // under at most one entry; on a tie a top-level link beats a menu item.
  let best: { id: number; length: number; direct: boolean } | undefined;
  for (const entry of headerNavEntries) {
    const hrefs = entry.items
      ? entry.items.filter((item) => !isExternal(item)).map((i) => i.href)
      : [entry.href];
    for (const href of hrefs) {
      if (!matchesPath(pathname, href)) continue;
      const candidate = {
        id: entry.id,
        length: href.length,
        direct: !entry.items,
      };
      if (
        !best ||
        candidate.length > best.length ||
        (candidate.length === best.length && candidate.direct && !best.direct)
      ) {
        best = candidate;
      }
    }
  }
  return best?.id;
}

const topLevelClass =
  "h-9 rounded-full bg-transparent px-3 text-sm font-medium tracking-tight text-secondary-foreground/60 hover:bg-secondary/60 hover:text-secondary-foreground focus:bg-transparent focus:text-secondary-foreground/60 focus-visible:bg-secondary/60 focus-visible:text-secondary-foreground data-[state=open]:bg-secondary/60 data-[state=open]:text-secondary-foreground data-[state=open]:hover:bg-secondary/60 data-[state=open]:focus:bg-secondary/60";
const activeClass =
  "bg-secondary/60 text-secondary-foreground focus:bg-secondary/60 focus:text-secondary-foreground";

/**
 * Hover intent. A closed menu opens once the pointer rests on a trigger this
 * long (Radix's delayDuration), and an open one switches to another trigger
 * only after SWITCH_INTENT_MS on it, so sweeping across the bar on the way
 * somewhere else neither opens nor flips through the menus.
 */
const HOVER_INTENT_MS = 200;
const SWITCH_INTENT_MS = 90;
/** The panel's close fade (header-nav.module.css): reopening within it morphs. */
const CLOSE_FADE_MS = 150;
/** Space the panel keeps from the window edges. */
const EDGE_GUTTER = 16;

/** Where the shared panel goes for a trigger, in the menu root's coordinates. */
interface PanelAnchor {
  x: number;
  center: number;
  min: number;
  max: number;
}

function measureAnchor(root: HTMLElement, trigger: HTMLElement): PanelAnchor {
  const box = root.getBoundingClientRect();
  const rect = trigger.getBoundingClientRect();
  const page = document.documentElement.clientWidth;
  return {
    x: rect.left - box.left,
    center: rect.left + rect.width / 2 - box.left,
    min: EDGE_GUTTER - box.left,
    max: page - EDGE_GUTTER - box.left,
  };
}

const anchorStyle = (anchor: PanelAnchor | undefined) =>
  anchor &&
  ({
    "--nav-x": `${anchor.x}px`,
    "--nav-center": `${anchor.center}px`,
    "--nav-min": `${anchor.min}px`,
    "--nav-max": `${anchor.max}px`,
  } as CSSProperties);

interface MenuState {
  /** The open entry's id as a string, or "" when closed. */
  value: string;
  /** Moving between menus: the panel glides and resizes (see the CSS). */
  morph: boolean;
  anchor?: PanelAnchor;
}

export function HeaderNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const activeId = getActiveEntryId(pathname);
  const rootRef = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const closedAt = useRef(0);
  /** The committed value, for handlers that run between renders. */
  const current = useRef("");
  /** The trigger under the pointer, if any. */
  const hovered = useRef<string | null>(null);
  const pendingSwitch = useRef(0);
  const [menu, setMenu] = useState<MenuState>({ value: "", morph: false });

  // Measured here rather than after render, so the panel's first frame
  // already sits under the new trigger.
  const commit = (value: string) => {
    const root = rootRef.current;
    const trigger = triggers.current.get(value);
    const anchor = root && trigger ? measureAnchor(root, trigger) : undefined;
    const now = performance.now();
    const fadingOut = now - closedAt.current < CLOSE_FADE_MS;
    if (!value) closedAt.current = now;
    const morph = value !== "" && (current.current !== "" || fadingOut);
    current.current = value;
    setMenu((prev) => ({ value, morph, anchor: anchor ?? prev.anchor }));
  };

  const onValueChange = (value: string) => {
    window.clearTimeout(pendingSwitch.current);
    const switching =
      current.current !== "" && value !== "" && value !== current.current;
    // Pointer moves between open menus wait for intent; keys and clicks don't.
    if (switching && hovered.current === value) {
      pendingSwitch.current = window.setTimeout(
        () => commit(value),
        SWITCH_INTENT_MS,
      );
      return;
    }
    commit(value);
  };

  useEffect(() => () => window.clearTimeout(pendingSwitch.current), []);

  // Keep the panel inside the window if it resizes while a menu is open.
  useEffect(() => {
    const value = menu.value;
    if (!value) return;
    const onResize = () => {
      const root = rootRef.current;
      const trigger = triggers.current.get(value);
      if (!root || !trigger) return;
      const anchor = measureAnchor(root, trigger);
      setMenu((prev) => (prev.value === value ? { ...prev, anchor } : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [menu.value]);

  return (
    <NavigationMenu
      ref={rootRef}
      value={menu.value}
      onValueChange={onValueChange}
      delayDuration={HOVER_INTENT_MS}
      aria-label="Main"
      data-morph={menu.morph ? "" : undefined}
      style={anchorStyle(menu.anchor)}
      className={cn(styles.nav, "hidden lg:flex", className)}
    >
      <NavigationMenuList className="gap-0.5">
        {headerNavEntries.map((entry) => {
          const active = entry.id === activeId;
          const value = String(entry.id);

          if (!entry.items) {
            return (
              <NavigationMenuItem key={entry.id}>
                <NavigationMenuLink
                  asChild
                  active={active}
                  className={cn(
                    "inline-flex flex-row items-center justify-center",
                    topLevelClass,
                    active && activeClass,
                  )}
                >
                  <Link
                    href={entry.href}
                    aria-current={active ? "page" : undefined}
                  >
                    {entry.name}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={entry.id} value={value}>
              <NavigationMenuTrigger
                ref={(node) => {
                  if (node) triggers.current.set(value, node);
                  else triggers.current.delete(value);
                }}
                onPointerEnter={(event) => {
                  // Radix opens on mouse hover only (touch taps click).
                  if (event.pointerType === "mouse") hovered.current = value;
                }}
                onPointerLeave={() => {
                  hovered.current = null;
                  window.clearTimeout(pendingSwitch.current);
                }}
                className={cn(topLevelClass, active && activeClass)}
              >
                {entry.name}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavPanel items={entry.items} pathname={pathname} />
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

/**
 * One dropdown: an optional featured panel on the left, the other items as
 * icon rows (two columns when there is no featured panel) and an optional
 * footer link to the group's hub. Its links don't prefetch: opening a menu
 * would fetch every destination's code at once.
 */
function NavPanel({
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
        <div className="mt-1 border-t pt-1">
          <NavigationMenuLink
            asChild
            active={pathname === hub.href}
            className="group/nav-item flex-row items-center gap-2 px-3 py-2.5"
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
                className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/nav-item:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </NavigationMenuLink>
        </div>
      )}
    </div>
  );
}

function NavRow({ item, pathname }: { item: HeaderNavItem; pathname: string }) {
  const external = isExternal(item);
  const current = !external && pathname === item.href;

  return (
    <NavigationMenuLink
      asChild
      active={current}
      className="group/nav-item flex-row items-start gap-3 p-2.5"
    >
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        prefetch={false}
        {...(external && externalProps)}
      >
        <NavIconTile icon={item.icon} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
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
      className="group/nav-item relative w-full justify-end gap-2 overflow-hidden border bg-muted/30 p-4 hover:bg-accent/50"
    >
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        prefetch={false}
      >
        <AsciiField
          variant="qr"
          density={0.8}
          radius={110}
          className="opacity-70 [mask-image:linear-gradient(to_bottom,black_10%,transparent_72%)]"
        />
        <NavIconTile
          icon={item.icon}
          className="relative mb-auto bg-background"
        />
        <span className="relative text-sm font-medium text-foreground">
          {item.name}
        </span>
        <span className="relative text-xs leading-relaxed text-muted-foreground text-pretty">
          {item.description}
        </span>
        <span className="relative mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          Open
          <ArrowRight
            aria-hidden
            className="size-3 transition-transform duration-150 group-hover/nav-item:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </Link>
    </NavigationMenuLink>
  );
}
