"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { siteConfig } from "@/config/site";

interface NavItem {
  id: number;
  name: string;
  href: string;
}

const navs: NavItem[] = siteConfig.nav.links;

export function NavMenu() {
  const ref = useRef<HTMLUListElement>(null);
  const pathname = usePathname();

  const [left, setLeft] = useState(0);
  const [width, setWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Determine if a nav item is active based on current pathname
  const isActive = useCallback(
    (item: NavItem): boolean => {
      // Exact match for home page
      if (pathname === "/" && item.href === "/") return true;

      // For non-home pages, check if pathname starts with the nav href
      if (item.href !== "/" && pathname.startsWith(item.href)) return true;

      return false;
    },
    [pathname],
  );

  // Find the currently active nav item
  const getActiveNavItem = useCallback((): NavItem | undefined => {
    return navs.find((nav) => isActive(nav));
  }, [isActive]);

  // Update nav indicator position based on active route
  const updateNavIndicator = useCallback((targetPath: string) => {
    const navItem = ref.current?.querySelector(
      `[href="${targetPath}"]`,
    )?.parentElement;

    if (navItem && ref.current) {
      setLeft(navItem.offsetLeft);
      setWidth(navItem.getBoundingClientRect().width);
    }
  }, []);

  // Initialize and update on route change
  useEffect(() => {
    const timer = setTimeout(() => {
      const activeRoute = getActiveNavItem();
      const targetPath = activeRoute?.href || navs[0].href;
      updateNavIndicator(targetPath);
      setIsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [pathname, getActiveNavItem, updateNavIndicator]);

  return (
    <div className="w-full hidden md:block">
      <ul
        className="relative mx-auto flex w-fit rounded-full h-11 px-2 items-center justify-center"
        ref={ref}
      >
        {navs.map((item) => (
          <li
            key={item.id}
            className={`z-10 cursor-pointer h-full flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              isActive(item)
                ? "text-secondary-foreground"
                : "text-secondary-foreground/60 hover:text-secondary-foreground"
            } tracking-tight`}
          >
            <Link href={item.href} prefetch={true}>
              {item.name}
            </Link>
          </li>
        ))}
        {isReady && (
          <motion.li
            animate={{ left, width }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute inset-0 my-1.5 rounded-full bg-secondary/60 border border-border"
          />
        )}
      </ul>
    </div>
  );
}
