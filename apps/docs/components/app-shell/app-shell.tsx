import type { ReactNode } from "react";
import { CodeOptionPlansProvider } from "@/app/dashboard/codes/_components/code-options";
import { codeOptionPlansFor } from "@/app/dashboard/codes/_lib/code-option-plans";
import { AppFrame } from "./app-frame";
import { CreateProvider } from "./create-actions";
import { getShellData } from "./shell-data";

/** Shared chrome for /dashboard and /settings: top bar, sidebar, content. */
export async function AppShell({ children }: { children: ReactNode }) {
  const shell = await getShellData();

  const content = (
    <CreateProvider codes={shell?.codes ?? null}>
      <AppFrame shell={shell}>{children}</AppFrame>
    </CreateProvider>
  );

  // The top bar's create dialog gets the plan's code options up front; with
  // no shell data it loads them itself (useCodeOptions).
  return shell ? (
    <CodeOptionPlansProvider plans={codeOptionPlansFor(shell.plan)}>
      {content}
    </CodeOptionPlansProvider>
  ) : (
    content
  );
}
