"use client";

import { toast } from "@repo/design-system";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { limitCopy } from "@/app/(app)/settings/usage/_lib/limit-copy";
import type { MeterId } from "@/app/(app)/settings/usage/_lib/meters";
import type { PaidPlan } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { LimitCard } from "./limit-card";
import {
  type LimitRequest,
  limitRequestMeter,
  limitResponse,
} from "./limit-request";
import { usePlanLimits } from "./plan-limits-provider";

interface LimitDialogState {
  request: LimitRequest | null;
  open: boolean;
  /** Mounted hosts (the app shell has one) */
  hosts: number;
  show: (request: LimitRequest) => void;
  close: () => void;
  /** Registers a host; returns its cleanup. */
  mountHost: () => () => void;
}

export const useLimitDialogStore = create<LimitDialogState>()((set) => ({
  request: null,
  open: false,
  hosts: 0,
  show: (request) => set({ request, open: true }),
  // The request stays, so the dialog doesn't change while it closes.
  close: () => set({ open: false }),
  mountHost: () => {
    set((state) => ({ hosts: state.hosts + 1 }));
    return () => set((state) => ({ hosts: state.hosts - 1 }));
  },
}));

/**
 * For a server answer of LIMIT_REACHED (or a create that would get one): the
 * matching limit card with its upgrade action. In the app shell, a cap this
 * plan doesn't have (a fixed cap no plan lifts) is just `message`; outside
 * the shell, the upgrade dialog, as before.
 */
export function useShowLimit() {
  const limits = usePlanLimits();
  const show = useLimitDialogStore((state) => state.show);
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  return useCallback(
    (
      meterId: MeterId,
      options: { used?: number; plan?: PaidPlan; message?: string } = {},
    ) => {
      const request = { meterId, used: options.used };
      const hosted = useLimitDialogStore.getState().hosts > 0;
      const response = limitResponse(request, { hosted, limits });
      if (response === "card") show(request);
      else if (response === "message") {
        if (options.message) toast.error(options.message);
      } else openUpgradeDialog(options.plan ?? "pro");
    },
    [limits, show, openUpgradeDialog],
  );
}

/** The limit card in a dialog; the app shell renders one. */
export function LimitDialogHost() {
  const limits = usePlanLimits();
  const request = useLimitDialogStore((state) => state.request);
  const open = useLimitDialogStore((state) => state.open);
  const close = useLimitDialogStore((state) => state.close);
  const mountHost = useLimitDialogStore((state) => state.mountHost);
  useEffect(() => mountHost(), [mountHost]);

  const meter = request && limits ? limitRequestMeter(request, limits) : null;
  const copy =
    meter && limits
      ? limitCopy(meter, {
          plan: limits.plan,
          canUpgrade: limits.canUpgrade,
          checkoutOpen: limits.checkoutOpen,
          cap: limits.caps[meter.id],
        })
      : null;

  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        if (!next) close();
      }}
      open={open && Boolean(copy)}
    >
      <ResponsiveDialogContent className="gap-4 px-5 pb-6 sm:max-w-md sm:p-6">
        <ResponsiveDialogHeader className="text-left">
          <ResponsiveDialogTitle>Limit reached</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {copy?.reason}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {meter && copy && limits && (
          <LimitCard
            copy={copy}
            meter={meter}
            onDismiss={close}
            onNavigate={close}
            showStatus={false}
            source="limit_dialog"
            usageHref={limits.usageHref}
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
