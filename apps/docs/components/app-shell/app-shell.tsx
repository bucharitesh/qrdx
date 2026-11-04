import type { ReactNode } from "react";
import { CodeOptionPlansProvider } from "@/app/dashboard/codes/_components/code-options";
import { codeOptionPlansFor } from "@/app/dashboard/codes/_lib/code-option-plans";
import { LimitDialogHost } from "@/components/limits/limit-dialog";
import { PlanLimitsProvider } from "@/components/limits/plan-limits-provider";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { getChangelogFeed } from "@/lib/changelog-feed-server";
import { AppFrame } from "./app-frame";
import { CreateProvider } from "./create-actions";
import { getShellData, getShellLimitWarnings } from "./shell-data";
import { WhatsNewProvider } from "./whats-new";

/**
 * Shared chrome for /dashboard/<slug> and /settings: top bar, sidebar,
 * content. Workspace links in it point at the open workspace (the URL's,
 * else the person's default on account pages).
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const shell = await getShellData();
  // Streamed into the sidebar: the page never waits on the counts.
  const limitWarnings = shell ? getShellLimitWarnings() : null;

  const content = (
    <WorkspaceProvider workspace={shell?.workspace ?? null}>
      <PlanLimitsProvider value={shell?.limits ?? null}>
        <WhatsNewProvider
          items={getChangelogFeed()}
          seen={shell?.changelogSeen ?? null}
        >
          <CreateProvider codes={shell?.codes ?? null}>
            <AppFrame limitWarnings={limitWarnings} shell={shell}>
              {children}
            </AppFrame>
          </CreateProvider>
          {/* The card a LIMIT_REACHED answer opens (components/limits). */}
          <LimitDialogHost />
        </WhatsNewProvider>
      </PlanLimitsProvider>
    </WorkspaceProvider>
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
