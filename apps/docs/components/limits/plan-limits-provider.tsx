"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { CheckoutOpen, MeterCaps } from "@/app/(app)/settings/usage/_lib/meters";
import type { Plan } from "@/lib/pricing";

/** What limit cards need to know about the open workspace's plan. */
export interface ShellLimits {
  plan: Plan;
  /** May change the workspace's plan (its owners) */
  canUpgrade: boolean;
  /** Paid plans checkout can sell right now */
  checkoutOpen: CheckoutOpen;
  /** Each meter's cap on this plan and the plan that lifts it */
  caps: MeterCaps;
  /** Someone else's workspace (its plan is its owners') */
  isTeam: boolean;
  /** Plan & usage of the open workspace */
  usageHref: string;
}

const PlanLimitsContext = createContext<ShellLimits | null>(null);

/** Set by the app shell; absent elsewhere (playground, marketing pages). */
export function PlanLimitsProvider({
  value,
  children,
}: {
  value: ShellLimits | null;
  children: ReactNode;
}) {
  return (
    <PlanLimitsContext.Provider value={value}>
      {children}
    </PlanLimitsContext.Provider>
  );
}

/** The open workspace's plan and caps; null outside the app shell. */
export function usePlanLimits(): ShellLimits | null {
  return useContext(PlanLimitsContext);
}
