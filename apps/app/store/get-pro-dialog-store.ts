import { create } from "zustand";
import type { PaidPlan } from "@/lib/pricing";

interface GetProDialogState {
  isOpen: boolean;
  /** The plan the dialog highlights: the lowest one with the locked feature. */
  plan: PaidPlan;
  /** Opens the dialog for Pro; safe to pass straight to onClick. */
  openGetProDialog: () => void;
  /** For features that need a specific tier, e.g. openUpgradeDialog("business"). */
  openUpgradeDialog: (plan: PaidPlan) => void;
  closeGetProDialog: () => void;
}

export const useGetProDialogStore = create<GetProDialogState>()((set) => ({
  isOpen: false,
  plan: "pro",
  openGetProDialog: () => set({ isOpen: true, plan: "pro" }),
  openUpgradeDialog: (plan) =>
    set({ isOpen: true, plan: plan === "business" ? "business" : "pro" }),
  closeGetProDialog: () => set({ isOpen: false }),
}));
