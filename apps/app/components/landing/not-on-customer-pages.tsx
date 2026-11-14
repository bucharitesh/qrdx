"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isUntrackedPath } from "./customer-page-paths";

/**
 * Renders children (QRdx analytics and support scripts) everywhere except
 * customer-facing pages (/p, /q, /ended) and the scanner (/scan).
 */
export function NotOnCustomerPages({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isUntrackedPath(pathname) ? null : children;
}
