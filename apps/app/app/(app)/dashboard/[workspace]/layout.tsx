import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { SyncWorkspace } from "@/components/workspaces/sync-workspace";
import { TwoFactorRequiredScreen } from "@/components/workspaces/two-factor-required";
import { signInPath } from "@/lib/safe-redirect";
import {
  type ActiveWorkspace,
  peekActiveWorkspace,
  WorkspaceNotFoundError,
} from "@/lib/scope";
import { workspaceHref } from "@/lib/workspace-paths";
import { defaultWorkspace } from "@/lib/workspaces";
import { UnauthorizedError } from "@/types/errors";

/**
 * Every page of a workspace: /dashboard/<slug>/... A slug that doesn't exist
 * and one the viewer isn't a member of look the same (404), so a URL never
 * tells whether a workspace exists. Signed-out visitors are redirected by
 * proxy.ts; this covers a session that ended in between.
 *
 * A workspace that requires two-step verification the viewer hasn't turned
 * on shows what to do instead of the app. The pages under it refuse on
 * their own (lib/scope.ts), since a layout doesn't stop them from rendering.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  let active: (ActiveWorkspace & { shutOut: boolean }) | null = null;
  let signedOut = false;
  try {
    active = await peekActiveWorkspace();
  } catch (error) {
    if (error instanceof UnauthorizedError) signedOut = true;
    else if (!(error instanceof WorkspaceNotFoundError)) throw error;
  }
  if (signedOut) redirect(signInPath(workspaceHref(slug)));
  // lib/scope reads the workspace from a header proxy.ts sets from this URL;
  // if the two ever disagree, nothing renders (and nothing can be written).
  if (!active || active.workspace.slug !== slug) notFound();

  if (active.shutOut) {
    const fallback = await defaultWorkspace(
      active.user,
      active.sessionWorkspaceId,
    );
    const other =
      fallback.shutOut || fallback.workspace.id === active.workspace.id
        ? null
        : fallback.workspace;
    return (
      <TwoFactorRequiredScreen other={other} workspace={active.workspace} />
    );
  }

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
