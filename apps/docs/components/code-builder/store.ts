"use client";

import { toast } from "@repo/design-system";
import { useEffect, useId } from "react";
import { create } from "zustand";
import type {
  QrCodeListItem,
  QrCodeView,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import type { QRStyle } from "@/types/theme";
import type { OptimisticEntry } from "./optimistic";
import type { BuilderFields } from "./types";

/**
 * Where the builder was opened from. "playground": the playground editor is
 * underneath, so results apply to it in place and nothing navigates there.
 */
export type CodeBuilderOrigin = "playground";

/** What `openCodeBuilder` was asked to open. */
export type CodeBuilderRequest =
  | {
      mode: "create";
      /** Prefill, e.g. a pasted URL */
      initial?: Partial<BuilderFields>;
      origin?: CodeBuilderOrigin;
    }
  | {
      mode: "edit";
      codeId: string;
      /**
       * The code as the caller already has it, to skip the lookup. A codes
       * list row (QrCodeListItem) also carries its folder and tags.
       */
      code?: QrCodeView | QrCodeListItem;
      origin?: CodeBuilderOrigin;
    }
  | {
      /** The hosted page gallery (NewCodeDialog), at a type and template */
      mode: "page";
      /** A page type (lib/landing/templates); none = the type list */
      type?: string;
      /** A template of that type to preselect */
      template?: string;
      /** The page code's design; none = the workspace's default theme */
      style?: QRStyle | null;
      origin?: CodeBuilderOrigin;
    };

interface CodeBuilderState {
  /** The open request; null while closed */
  request: CodeBuilderRequest | null;
  /** Bumped on every open, so reopening the same code starts fresh */
  session: number;
  /** Mounted CodeBuilderHost ids; only the first one renders the builder */
  hosts: string[];
  /** Saves in flight or just finished, shown in the codes list right away */
  optimistic: Record<string, OptimisticEntry>;
  open: (request: CodeBuilderRequest) => void;
  close: () => void;
  registerHost: (id: string) => () => void;
  putOptimistic: (entry: OptimisticEntry) => void;
  dropOptimistic: (key: string) => void;
  /** Forget finished saves the list now shows from the server */
  pruneOptimistic: (keys: string[]) => void;
}

export const useCodeBuilderStore = create<CodeBuilderState>()((set) => ({
  request: null,
  session: 0,
  hosts: [],
  optimistic: {},
  open: (request) => set((state) => ({ request, session: state.session + 1 })),
  close: () => set({ request: null }),
  registerHost: (id) => {
    set((state) => ({ hosts: [...state.hosts, id] }));
    return () =>
      set((state) => ({ hosts: state.hosts.filter((host) => host !== id) }));
  },
  putOptimistic: (entry) =>
    set((state) => ({
      optimistic: { ...state.optimistic, [entry.key]: entry },
    })),
  dropOptimistic: (key) =>
    set((state) => {
      const { [key]: _dropped, ...rest } = state.optimistic;
      return { optimistic: rest };
    }),
  pruneOptimistic: (keys) =>
    set((state) => {
      if (keys.length === 0) return state;
      const next = { ...state.optimistic };
      for (const key of keys) delete next[key];
      return { optimistic: next };
    }),
}));

/**
 * Registers the calling component as a builder host and says whether it is
 * the one that renders (the first mounted). Kept here, apart from the host's
 * markup, so the playground can register a host without loading the builder.
 */
export function useCodeBuilderHostSlot(): boolean {
  const id = useId();
  const registerHost = useCodeBuilderStore((state) => state.registerHost);
  const active = useCodeBuilderStore((state) => state.hosts[0] === id);
  useEffect(() => registerHost(id), [registerHost, id]);
  return active;
}

/**
 * Opens the dynamic code builder from anywhere in the app (the app shell
 * and the playground mount a host). Create a new code, edit one by id, or
 * open the hosted page gallery.
 */
export function openCodeBuilder(
  request:
    | Extract<CodeBuilderRequest, { mode: "create" | "page" }>
    | {
        mode: "edit";
        codeId?: string;
        code?: QrCodeView | QrCodeListItem;
        origin?: CodeBuilderOrigin;
      },
): void {
  const store = useCodeBuilderStore.getState();
  if (store.hosts.length === 0) {
    // A page outside the app shell: say so instead of doing nothing.
    console.error(
      "openCodeBuilder: no CodeBuilderHost is mounted on this page.",
    );
    toast.error("The code builder isn't available on this page.");
    return;
  }
  if (request.mode === "edit") {
    const codeId = request.codeId ?? request.code?.id;
    if (!codeId) {
      console.error("openCodeBuilder: edit needs a codeId.");
      toast.error("Couldn't open this code.");
      return;
    }
    store.open({
      mode: "edit",
      codeId,
      code: request.code,
      ...(request.origin && { origin: request.origin }),
    });
    return;
  }
  store.open(request);
}

export function closeCodeBuilder(): void {
  useCodeBuilderStore.getState().close();
}
