"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { recordPathname } from "@/lib/navigation-history";

/** Records each page visited in this tab (lib/navigation-history.ts). Renders nothing. */
export function NavigationHistory() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordPathname(pathname);
  }, [pathname]);
  return null;
}
