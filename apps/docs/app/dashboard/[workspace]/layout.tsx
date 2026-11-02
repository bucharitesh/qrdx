import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { SyncWorkspace } from "@/components/workspaces/sync-workspace";
import { signInPath } from "@/lib/safe-redirect";
import {
  type ActiveWorkspace,
  getActiveWorkspace,
  WorkspaceNotFoundError,
} from "@/lib/scope";
import { workspaceHref } from "@/lib/workspace-paths";
import { UnauthorizedError } from "@/types/errors";

/**
 * Every page of a workspace: /dashboard/<slug>/... A slug that doesn't exist
 * and one the viewer isn't a member of look the same (404), so a URL never
 * tells whether a workspace exists. Signed-out visitors are redirected by
 * proxy.ts; this covers a session that ended in between.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  let active: ActiveWorkspace | null = null;
  let signedOut = false;
  try {
    active = await getActiveWorkspace();
  } catch (error) {
    if (error instanceof UnauthorizedError) signedOut = true;
    else if (!(error instanceof WorkspaceNotFoundError)) throw error;
  }
  if (signedOut) redirect(signInPath(workspaceHref(slug)));
  // lib/scope reads the workspace from a header proxy.ts sets from this URL;
  // if the two ever disagree, nothing renders (and nothing can be written).
  if (!active || active.workspace.slug !== slug) notFound();

  return (
    <AppShell>
      <SyncWorkspace
        isSessionWorkspace={active.sessionWorkspaceId === active.workspace.id}
        workspaceId={active.workspace.id}
      />
      {children}
    </AppShell>
  );
}
