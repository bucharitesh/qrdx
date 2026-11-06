// Who may do what in a workspace: one table for the whole app. Server
// actions, API routes and the UI all ask `can(role, action)`; the server
// throws with lib/permissions-server.ts `assertCan`. Pure and client-safe.
//
// Roles are Better Auth organization roles (member.role, comma-separated
// when someone holds several; QRdx assigns one). packages/auth/server.ts
// registers the same five with the plugin.

export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "member",
  "billing",
  "viewer",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  billing: "Billing",
  viewer: "Viewer",
};

/** One line per role, for the role pickers. */
export const WORKSPACE_ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Everything, including billing, owners and deleting the workspace",
  admin: "Manage people, settings, domains and everyone's codes",
  member: "Create codes and pages, and edit the workspace's codes",
  billing: "Manage the plan and billing; read-only everywhere else",
  viewer: "See codes, pages and analytics, without changing anything",
};

/** Strongest first: the order of the pickers, and how several roles resolve. */
const RANK: Record<WorkspaceRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  billing: 3,
  viewer: 4,
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && Object.hasOwn(RANK, value);
}

/**
 * The strongest role in Better Auth's comma-separated role field. Anything
 * unknown counts as viewer, so a role this code doesn't know never grants
 * more than reading.
 */
export function strongestRole(field: string | null | undefined): WorkspaceRole {
  let best: WorkspaceRole = "viewer";
  for (const part of (field ?? "").split(",")) {
    const role = part.trim();
    if (isWorkspaceRole(role) && RANK[role] < RANK[best]) best = role;
  }
  return best;
}

/** 0 for owner up to 4 for viewer. */
export function roleRank(role: WorkspaceRole): number {
  return RANK[role];
}

export type WorkspaceAction =
  /** Create codes, pages, files, folders, tags and themes; edit codes; delete your own */
  | "content.write"
  /** Delete or change what other members created */
  | "content.manageAll"
  /** Name, URL and logo, and the join link */
  | "workspace.update"
  | "workspace.delete"
  /** Invite people, revoke invitations, change roles, remove members */
  | "members.manage"
  /** Give or take away the owner and billing roles */
  | "owners.manage"
  | "domains.manage"
  /** Set up and change the workspace's single sign-on */
  | "sso.manage"
  | "webhooks.manage"
  /** The workspace's shared themes and its default theme */
  | "themes.manage"
  /** Create API keys (a key acts with its creator's role) */
  | "apiKeys.create"
  /** See and revoke everyone's API keys */
  | "apiKeys.manageAll"
  | "oauthApps.manage"
  /** Upgrade, change or cancel the plan that the workspace runs on */
  | "billing.manage";

const ALLOWED: Record<WorkspaceAction, readonly WorkspaceRole[]> = {
  "content.write": ["owner", "admin", "member"],
  "content.manageAll": ["owner", "admin"],
  "workspace.update": ["owner", "admin"],
  "workspace.delete": ["owner"],
  "members.manage": ["owner", "admin"],
  "owners.manage": ["owner"],
  "domains.manage": ["owner", "admin"],
  // The SSO plugin checks the same two roles (its ADMIN_ROLES).
  "sso.manage": ["owner", "admin"],
  "webhooks.manage": ["owner", "admin"],
  "themes.manage": ["owner", "admin"],
  "apiKeys.create": ["owner", "admin", "member"],
  "apiKeys.manageAll": ["owner", "admin"],
  "oauthApps.manage": ["owner"],
  "billing.manage": ["owner", "billing"],
};

export const WORKSPACE_ACTIONS = Object.keys(ALLOWED) as WorkspaceAction[];

export function can(
  role: WorkspaceRole | null | undefined,
  action: WorkspaceAction,
): boolean {
  return Boolean(role && ALLOWED[action].includes(role));
}

/** Read-only roles: they see the workspace but change nothing in it. */
export function isReadOnlyRole(role: WorkspaceRole | null | undefined) {
  return !can(role, "content.write");
}

/**
 * Roles that pay for the workspace: its plan is the best plan among the
 * members holding one of them (lib/plans.ts, packages/auth/server.ts).
 */
export const PLAN_ROLES: readonly WorkspaceRole[] = ["owner", "billing"];

/** True when the role field holds a role whose plan counts for the workspace. */
export function holdsPlanRole(field: string | null | undefined): boolean {
  return (field ?? "")
    .split(",")
    .some((part) => PLAN_ROLES.includes(part.trim() as WorkspaceRole));
}

/** Roles a join link or an invitation can give (never owner). */
export const JOINABLE_ROLES: readonly WorkspaceRole[] = [
  "admin",
  "member",
  "billing",
  "viewer",
];

/**
 * Whether `actor` may change someone from `from` to `to` (or invite as `to`
 * when `from` is null). Admins handle admin, member and viewer; only owners
 * give or take away owner and billing, which decide who pays.
 */
export function canAssignRole(
  actor: WorkspaceRole,
  from: WorkspaceRole | null,
  to: WorkspaceRole,
): boolean {
  if (!can(actor, "members.manage")) return false;
  const sensitive = (role: WorkspaceRole | null) =>
    role === "owner" || role === "billing";
  if (sensitive(from) || sensitive(to)) return can(actor, "owners.manage");
  return true;
}

/** The roles `actor` may hand out, strongest first. */
export function assignableRoles(
  actor: WorkspaceRole,
  from: WorkspaceRole | null = null,
): WorkspaceRole[] {
  return WORKSPACE_ROLES.filter((to) => canAssignRole(actor, from, to));
}

const WHO: Record<WorkspaceAction, string> = {
  "content.write": "owners, admins and members",
  "content.manageAll": "owners and admins",
  "workspace.update": "owners and admins",
  "workspace.delete": "owners",
  "members.manage": "owners and admins",
  "owners.manage": "owners",
  "domains.manage": "owners and admins",
  "sso.manage": "owners and admins",
  "webhooks.manage": "owners and admins",
  "themes.manage": "owners and admins",
  "apiKeys.create": "owners, admins and members",
  "apiKeys.manageAll": "owners and admins",
  "oauthApps.manage": "owners",
  "billing.manage": "owners and billing members",
};

const WHAT: Record<WorkspaceAction, string> = {
  "content.write": "create or change things in this workspace",
  "content.manageAll": "change what other members created",
  "workspace.update": "change this workspace's settings",
  "workspace.delete": "delete this workspace",
  "members.manage": "manage this workspace's people",
  "owners.manage": "give or take away the owner and billing roles",
  "domains.manage": "manage this workspace's domains",
  "sso.manage": "set up single sign-on for this workspace",
  "webhooks.manage": "manage this workspace's webhooks",
  "themes.manage": "manage this workspace's shared themes",
  "apiKeys.create": "create API keys in this workspace",
  "apiKeys.manageAll": "manage other members' API keys",
  "oauthApps.manage": "manage this workspace's OAuth apps",
  "billing.manage": "change this workspace's plan",
};

/** Why `role` can't do `action`, in a sentence the UI can show as is. */
export function forbiddenMessage(
  role: WorkspaceRole | null | undefined,
  action: WorkspaceAction,
): string {
  const who = WHO[action];
  const only = `Only ${who} can ${WHAT[action]}.`;
  if (role === "viewer") return `You're a viewer here. ${only}`;
  if (role === "billing" && action !== "billing.manage") {
    return `Your billing role covers the plan only. ${only}`;
  }
  return only;
}
