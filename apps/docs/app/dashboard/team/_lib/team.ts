export type TeamRole = "owner" | "admin" | "member";

/** 3-48 lowercase letters, digits and inner dashes. */
export const TEAM_SLUG_PATTERN = "^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$";

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: "Everything admins can do, plus making owners and deleting the team",
  admin: "Invite and remove members, change roles",
  member: "Create and edit the team's codes and brand kits",
};

/** Strongest role in Better Auth's comma-separated role field. */
export function primaryRole(role: string): TeamRole {
  const roles = role.split(",").map((r) => r.trim());
  if (roles.includes("owner")) return "owner";
  return roles.includes("admin") ? "admin" : "member";
}

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
