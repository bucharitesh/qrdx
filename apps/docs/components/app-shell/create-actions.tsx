"use client";

import { toast } from "@repo/design-system";
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
import { PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
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
 * and the page gallery for a landing page or form. At the Free cap, a new
 * code goes to the upgrade dialog instead, like the codes list.
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
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );

  const start = useCallback(
    (next: CreateKind) => {
      if (next === "code" && codes && codes.used >= codes.limit) {
        toast.error(
          `Your plan includes ${codes.limit} active dynamic codes. ${codes.unlimitedPlan ? `Archive one or upgrade to ${PLAN_NAMES[codes.unlimitedPlan]}.` : "Archive one to make room."}`,
        );
        openGetProDialog();
        return;
      }
      if (next === "code") {
        openCodeBuilder({ mode: "create" });
        return;
      }
      setKind(next);
      setOpen(true);
    },
    [codes, openGetProDialog],
  );

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
