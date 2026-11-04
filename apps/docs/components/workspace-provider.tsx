"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";
import {
  can,
  type WorkspaceAction,
  type WorkspaceRole,
} from "@/lib/permissions";
import { WORKSPACE_HEADER, workspaceLink } from "@/lib/workspace-paths";

/** What client components know about the open workspace (no secrets). */
export interface ClientWorkspace {
  id: string;
  name: string;
  slug: string;
  /** The viewer's role in it */
  role: WorkspaceRole;
  /** Its logo (an image URL), or null for the initial letter */
  logo?: string | null;
  /** The viewer's own workspace */
  own: boolean;
}

const WorkspaceContext = createContext<ClientWorkspace | null>(null);

// This tab's open workspace, for fetches to /api routes (which have no slug
// in their URL). Browser only: set while rendering, so it's in place before
// any child effect or query runs, and never on the server, where one module
// serves every request.
let openSlug: string | null = null;

/**
 * Headers that tell an /api route handler which workspace this tab has
 * open (lib/scope.ts checks membership; without it, the session's
 * workspace is used).
 */
export function workspaceRequestHeaders(): Record<string, string> {
  return openSlug ? { [WORKSPACE_HEADER]: openSlug } : {};
}

/** Set by the app shell (components/app-shell/app-shell.tsx). */
export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: ClientWorkspace | null;
  children: ReactNode;
}) {
  if (typeof window !== "undefined") openSlug = workspace?.slug ?? null;
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/** The open workspace; null outside the app shell (playground, site). */
export function useWorkspace(): ClientWorkspace | null {
  return useContext(WorkspaceContext);
}

/** The open workspace's slug, or null outside the app shell. */
export function useWorkspaceSlug(): string | null {
  return useContext(WorkspaceContext)?.slug ?? null;
}

/**
 * Builds links into the open workspace: `href("/codes")` is
 * /dashboard/<slug>/codes. Outside the app shell (the playground, the site)
 * it links through /dashboard?to=…, which opens the reader's default
 * workspace.
 */
export function useWorkspaceHref(): (path?: string) => string {
  const workspace = useContext(WorkspaceContext);
  const slug = workspace?.slug ?? null;
  return useCallback((path = "") => workspaceLink(slug, path), [slug]);
}

/**
 * Whether the signed-in person may do `action` in the open workspace, for
 * hiding controls (the server checks again). Outside the app shell there is
 * no workspace and this is false.
 */
export function useCan(action: WorkspaceAction): boolean {
  return can(useContext(WorkspaceContext)?.role, action);
}
