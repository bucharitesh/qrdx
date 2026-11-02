"use client";

import { toast } from "@repo/design-system";
import { create } from "zustand";
import type {
  QrCodeListItem,
  QrCodeView,
} from "@/app/dashboard/codes/_lib/qr-codes";
import type { OptimisticEntry } from "./optimistic";
import type { BuilderFields } from "./types";

/** What `openCodeBuilder` was asked to open. */
export type CodeBuilderRequest =
  | {
      mode: "create";
      /** Prefill, e.g. a pasted URL */
      initial?: Partial<BuilderFields>;
    }
  | {
      mode: "edit";
      codeId: string;
      /**
       * The code as the caller already has it, to skip the lookup. A codes
       * list row (QrCodeListItem) also carries its folder and tags.
       */
      code?: QrCodeView | QrCodeListItem;
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
 * Opens the dynamic code builder from anywhere in the app (the app shell
 * mounts its host). Create a new code, or edit one by id.
 */
export function openCodeBuilder(
  request:
    | { mode: "create"; initial?: Partial<BuilderFields> }
    | {
        mode: "edit";
        codeId?: string;
        code?: QrCodeView | QrCodeListItem;
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
    store.open({ mode: "edit", codeId, code: request.code });
    return;
  }
  store.open(request);
}

export function closeCodeBuilder(): void {
  useCodeBuilderStore.getState().close();
}
