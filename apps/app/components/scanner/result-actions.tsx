"use client";

import { createContext, type ReactNode } from "react";

/**
 * Extra actions in a scan result's header. The website adds none; the native
 * apps (apps/native) add Share.
 */
export const ResultActions = createContext<
  ((scan: { value: string; format: string }) => ReactNode) | null
>(null);
