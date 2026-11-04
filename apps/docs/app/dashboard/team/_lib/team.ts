import {
  strongestRole,
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/permissions";

// Roles, labels and descriptions live in lib/permissions.ts (one table for
// the server and the UI); these names stay for the team pages.
export type TeamRole = WorkspaceRole;

/** 3-48 lowercase letters, digits and inner dashes. */
export const TEAM_SLUG_PATTERN = "^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$";

export const TEAM_ROLE_LABELS = WORKSPACE_ROLE_LABELS;
export const TEAM_ROLE_DESCRIPTIONS = WORKSPACE_ROLE_DESCRIPTIONS;

/** Strongest role in Better Auth's comma-separated role field. */
export const primaryRole = strongestRole;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function invitePath(invitationId: string): string {
  return `/invite/${encodeURIComponent(invitationId)}`;
}

const utcDateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const utcDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** Same output on server and client (no hydration mismatch). */
export function formatUtcDateTime(value: Date | string): string {
  return `${utcDateTime.format(new Date(value))} UTC`;
}

export function formatUtcDate(value: Date | string): string {
  return utcDate.format(new Date(value));
}
