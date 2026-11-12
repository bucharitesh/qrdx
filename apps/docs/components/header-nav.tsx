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
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  LocaleLink as Link,
  useLocalizeHref,
} from "@/components/i18n/locale-link";
import { MAX_BULK_ROWS } from "@/components/sections/tools/bulk-utils";
import {
  type NavEntryConfig,
  type NavItemConfig,
  siteConfig,
} from "@/config/site";
import { splitLocale } from "@/lib/i18n/paths";
import bar from "./header-bar.module.css";
import styles from "./header-nav.module.css";
import { NavPanel, navPanelRootClass } from "./header-nav-panel";

/** A header link with its copy in the visitor's language. */
export interface HeaderNavItem extends Omit<NavItemConfig, "key"> {
  name: string;
  description: string;
}

export interface HeaderNavEntry {
  id: number;
  name: string;
  href: string;
  items?: HeaderNavItem[];
}

export const headerNavEntries: NavEntryConfig[] = siteConfig.nav.links;

/**
 * The header entries in the visitor's language, without links to pages for
 * features this deployment can't offer (lib/feature-availability-rules.ts),
 * like AI QR art. Hrefs point at the page in that language where it exists.
 */
export function useHeaderNavEntries(): HeaderNavEntry[] {
  const { showsPath } = useAvailability();
  const t = useTranslations("nav");
  const localize = useLocalizeHref();
  return useMemo(
    () =>
      headerNavEntries.flatMap((entry) => {
        const name = t(`entries.${entry.key}`);
        const href = localize(entry.href);
        if (!entry.items) {
          return showsPath(entry.href) ? [{ id: entry.id, name, href }] : [];
        }
        const items = entry.items
          .filter((item) => item.external || showsPath(item.href))
          .map(({ key, ...item }) => ({
            ...item,
            href: localize(item.href),
            name: t(`items.${key}.name`),
            description: t(`items.${key}.description`, { max: MAX_BULK_ROWS }),
          }));
        return items.length > 0 ? [{ id: entry.id, name, href, items }] : [];
      }),
    [showsPath, t, localize],
  );
}

const isExternal = (item: NavItemConfig) => Boolean(item.external);

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

/** Colors and states come from header-bar.module.css (`.pill`). */
const topLevelClass = cn(
  bar.pill,
  "h-9 px-3 text-sm font-medium tracking-tight",
);

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

/**
 * A closed dropdown's links, as plain anchors in the server HTML. Radix only
 * mounts a panel once it opens, so without these the page's first HTML has
 * no link to anything inside Product, Tools, Developers or Resources and
 * crawlers can't follow them. `hidden` keeps them out of view, out of the tab
 * order and out of the accessibility tree; the open panel is what people use.
 */
function MenuLinks({ items }: { items: HeaderNavItem[] }) {
  return (
    <ul hidden>
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href}>{item.name}</a>
        </li>
      ))}
    </ul>
  );
}

interface MenuState {
  /** The open entry's id as a string, or "" when closed. */
  value: string;
  /** Moving between menus: the panel glides and resizes (see the CSS). */
  morph: boolean;
  anchor?: PanelAnchor;
}

export function HeaderNav({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const entries = useHeaderNavEntries();
  // Hrefs are localized, so match the current page by its localized URL…
  const pathname = usePathname() ?? "/";
  // …and the active entry by its English path.
  const activeId = getActiveEntryId(splitLocale(pathname).path);
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
      aria-label={t("main")}
      data-morph={menu.morph ? "" : undefined}
      style={anchorStyle(menu.anchor)}
      className={cn(
        styles.nav,
        bar.bar,
        navPanelRootClass,
        "hidden lg:flex",
        className,
      )}
    >
      <NavigationMenuList className="gap-0.5">
        {entries.map((entry) => {
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
                    active && bar.current,
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
                className={cn(topLevelClass, active && bar.current)}
              >
                {entry.name}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavPanel items={entry.items} pathname={pathname} />
              </NavigationMenuContent>
              <MenuLinks items={entry.items} />
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
