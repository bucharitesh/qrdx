import type { ReactNode } from "react";
import { CodeOptionPlansProvider } from "@/app/(app)/dashboard/codes/_components/code-options";
import { codeOptionPlansFor } from "@/app/(app)/dashboard/codes/_lib/code-option-plans";
import { changelogBodies } from "@/components/changelog/changelog-body";
import { LimitDialogHost } from "@/components/limits/limit-dialog";
import { PlanLimitsProvider } from "@/components/limits/plan-limits-provider";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { env } from "@/env";
import { toDay } from "@/lib/changelog-feed";
import { getChangelogFeed } from "@/lib/changelog-feed-server";
import { AppFrame } from "./app-frame";
import { CreateProvider } from "./create-actions";
import { SpotlightProvider } from "./feature-spotlight";
import { SetupGuide } from "./setup-guide";
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
  const seen = shell?.changelogSeen ?? null;
  const items = getChangelogFeed();

  const content = (
    <WorkspaceProvider workspace={shell?.workspace ?? null}>
      <PlanLimitsProvider value={shell?.limits ?? null}>
        <SpotlightProvider
          seen={seen?.spotlights ?? []}
          viewerId={seen?.viewerId ?? null}
        >
          <WhatsNewProvider
            // The release notes for the entry modal, rendered here once.
            bodies={changelogBodies(
              items.map((item) => item.slug),
              "text-sm",
            )}
            items={items}
            seen={seen}
            today={toDay(new Date()) ?? ""}
          >
            <CreateProvider codes={shell?.codes ?? null}>
              <AppFrame
                // Docs search goes through the docs site (/api/search).
                docsSearch={Boolean(env.DOCS_ZONE_URL)}
                limitWarnings={limitWarnings}
                shell={shell}
              >
                {children}
              </AppFrame>
              {/* "Get set up", bottom right: loads its own tasks. */}
              <SetupGuide />
            </CreateProvider>
            {/* The card a LIMIT_REACHED answer opens (components/limits). */}
            <LimitDialogHost />
          </WhatsNewProvider>
        </SpotlightProvider>
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
