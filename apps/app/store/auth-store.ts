/** biome-ignore-all lint/suspicious/noExplicitAny: false positive */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PostLoginActionType,
  StoredPostLoginAction,
} from "@/lib/hooks/use-post-login-action";

interface AuthStore {
  isOpen: boolean;
  mode: "signin" | "signup";
  postLoginAction: StoredPostLoginAction;
  /** Same-site page to land on after signing in (null: stay on this page). */
  callbackURL: string | null;
  openAuthDialog: (
    mode?: "signin" | "signup",
    postLoginActionType?: PostLoginActionType,
    postLoginActionData?: any,
  ) => void;
  /** Opens sign-in for a page that needs an account, landing there after. */
  openSignInTo: (callbackURL: string) => void;
  closeAuthDialog: () => void;
  clearPostLoginAction: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isOpen: false,
      mode: "signin",
      postLoginAction: null,
      callbackURL: null,
      openAuthDialog: (
        newMode?: "signin" | "signup",
        postLoginActionType?: PostLoginActionType,
        postLoginActionData?: any,
      ) => {
        set((state) => ({
          isOpen: true,
          mode: newMode || state.mode,
          postLoginAction: postLoginActionType
            ? { type: postLoginActionType, data: postLoginActionData }
            : null,
          callbackURL: null,
        }));
      },
      openSignInTo: (callbackURL: string) => {
        set({
          isOpen: true,
          mode: "signin",
          postLoginAction: null,
          callbackURL,
        });
      },
      closeAuthDialog: () => {
        set({ isOpen: false, callbackURL: null });
      },
      clearPostLoginAction: () => {
        set({ postLoginAction: null });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ postLoginAction: state.postLoginAction }),
    },
  ),
);
