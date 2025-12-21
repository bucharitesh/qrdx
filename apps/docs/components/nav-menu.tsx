"use client";

import { siteConfig } from "@/config/site";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useRef, useState } from "react";

interface NavItem {
  id: number;
  name: string;
  href: string;
}

const navs: NavItem[] = siteConfig.nav.links;

export function NavMenu() {
  const ref = useRef<HTMLUListElement>(null);
  const [left, setLeft] = useState(0);
  const [width, setWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    // Initialize with active item
    const activeItem = navs.find((item) => {
      if (item.href === "/") return pathname === "/";
      return pathname.startsWith(item.href);
    });

    if (activeItem && ref.current) {
      const element = ref.current.querySelector(
        `[data-nav-id="${activeItem.id}"]`,
      );
      if (element) {
        const rect = element.getBoundingClientRect();
        const listRect = ref.current.getBoundingClientRect();
        setLeft(
          (element as HTMLElement).offsetLeft,
        );
        setWidth(rect.width);
        setIsReady(true);
      }
    }
  }, [pathname]);

  const handleMouseEnter = (item: NavItem, e: React.MouseEvent<HTMLLIElement>) => {
    setHoveredItem(item.href);
    const listItem = e.currentTarget;
    const rect = listItem.getBoundingClientRect();
    setLeft(listItem.offsetLeft);
    setWidth(rect.width);
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
    // Reset to active item
    const activeItem = navs.find((item) => {
      if (item.href === "/") return pathname === "/";
      return pathname.startsWith(item.href);
    });

    if (activeItem && ref.current) {
      const element = ref.current.querySelector(
        `[data-nav-id="${activeItem.id}"]`,
      );
      if (element) {
        const rect = element.getBoundingClientRect();
        setLeft((element as HTMLElement).offsetLeft);
        setWidth(rect.width);
      }
    }
  };

  const isActive = (item: NavItem) => {
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  };

  return (
    <div className="w-full hidden md:block">
      <ul
        className="relative mx-auto flex w-fit rounded-full h-11 px-2 items-center justify-center"
        ref={ref}
      >
        {navs.map((item) => (
          <li
            key={item.id}
            data-nav-id={item.id}
            className={`z-10 cursor-pointer h-full flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              isActive(item)
                ? "text-primary"
                : "text-primary/60 hover:text-primary"
            } tracking-tight`}
            onMouseEnter={(e) => handleMouseEnter(item, e)}
            onMouseLeave={handleMouseLeave}
          >
            <Link href={item.href}>
              {item.name}
            </Link>
          </li>
        ))}
        {isReady && (
          <motion.li
            animate={{ left, width }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute inset-0 my-1.5 rounded-full bg-accent/60 border border-border"
          />
        )}
      </ul>
    </div>
  );
}

