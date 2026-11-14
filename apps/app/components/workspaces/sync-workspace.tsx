"use client";

import { authClient } from "@repo/auth/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { rememberWorkspace } from "@/actions/organizations";

/**
 * Keeps the rest of the app in step with the workspace in the URL. Opening
 * one makes it the session's workspace (used by the playground and pages
 * outside a workspace) and the one the next sign-in starts in; moving to
 * another drops cached client data that belonged to the one left.
 */
export function SyncWorkspace({
  workspaceId,
  isSessionWorkspace,
}: {
  workspaceId: string;
  /** The session already has this workspace */
  isSessionWorkspace: boolean;
}) {
  const queryClient = useQueryClient();
  const previous = useRef(workspaceId);

  useEffect(() => {
    if (previous.current === workspaceId) return;
    previous.current = workspaceId;
    queryClient.invalidateQueries();
  }, [workspaceId, queryClient]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: moving between two workspaces neither of which is the session's leaves isSessionWorkspace false, so the id must re-run it
  useEffect(() => {
    if (isSessionWorkspace) return;
    let cancelled = false;
    rememberWorkspace().then(() => {
      if (!cancelled) authClient.$store.notify("$sessionSignal");
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, isSessionWorkspace]);

  return null;
}
