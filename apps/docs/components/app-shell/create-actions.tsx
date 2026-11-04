"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { NewCodeDialog } from "@/app/dashboard/codes/_components/new-code-dialog";
import { CodeBuilderHost } from "@/components/code-builder/code-builder-host";
import { openCodeBuilder } from "@/components/code-builder/store";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { isSettingsPath } from "./nav-config";
import { usePasteToCreate } from "./paste-to-create";
import type { ShellData } from "./shell-data";

/** What the Create menu, ⌘K and the `c` key can start. */
export type CreateKind = "code" | "page" | "form";

/** The page template that collects responses (lib/landing/templates/feedback). */
export const FORM_PAGE_TYPE = "feedback";

const CreateContext = createContext<((kind: CreateKind) => void) | null>(null);

/** Starts creating a dynamic code, landing page or form from anywhere in the app. */
export function useCreate() {
  const start = useContext(CreateContext);
  if (!start) throw new Error("useCreate must be used inside CreateProvider");
  return start;
}

/**
 * Holds what the app chrome opens: the code builder for a new dynamic code
 * (also from a pasted web address) and the page gallery for a landing page
 * or form. At the plan's cap (the server would answer LIMIT_REACHED), a new
 * code shows the limit card instead, like the codes list.
 */
export function CreateProvider({
  codes,
  children,
}: {
  codes: ShellData["codes"];
  children: ReactNode;
}) {
  // The kind outlives `open`, so the dialog doesn't change while it closes.
  const [kind, setKind] = useState<Exclude<CreateKind, "code">>("page");
  const [open, setOpen] = useState(false);
  const showLimit = useShowLimit();
  const pathname = usePathname();

  const startCode = useCallback(
    (destination?: string) => {
      if (codes && codes.used >= codes.limit) {
        showLimit("dynamicCodes", { used: codes.used });
        return;
      }
      openCodeBuilder(
        destination
          ? { mode: "create", initial: { destination } }
          : { mode: "create" },
      );
    },
    [codes, showLimit],
  );

  const start = useCallback(
    (next: CreateKind) => {
      if (next === "code") {
        startCode();
        return;
      }
      setKind(next);
      setOpen(true);
    },
    [startCode],
  );

  // Paste a web address on a dashboard page (not in a field, no dialog
  // open) to start a code for it, as on Dub's links page. Settings pages,
  // full of URL fields, leave pastes alone.
  usePasteToCreate(startCode, !isSettingsPath(pathname));

  return (
    <CreateContext.Provider value={start}>
      {children}
      {/* New dynamic codes open the code builder; pages and forms the gallery. */}
      <CodeBuilderHost usage={codes} />
      <NewCodeDialog
        initialType={kind === "form" ? FORM_PAGE_TYPE : null}
        onOpenChange={setOpen}
        open={open}
        pagesOnly
      />
    </CreateContext.Provider>
  );
}
