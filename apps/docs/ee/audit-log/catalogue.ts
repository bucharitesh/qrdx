// The workspace audit log's actions: every action id the app records, its
// category (the Settings → Audit log filter) and the sentence a row reads
// as. Pure and client-safe. tests/ee/audit-log-catalogue.test.ts fails when an
// action has no category or sentence.
//
// `{target}` in a sentence is the target's name as recorded (a code's name,
// a member's email, a domain); a sentence without it describes the actor's
// own change ("Left the workspace").

export const AUDIT_CATEGORIES = [
  "codes",
  "pages",
  "team",
  "security",
  "developers",
  "domains",
  "workspace",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  codes: "Codes",
  pages: "Pages",
  team: "Team",
  security: "Security",
  developers: "Developers",
  domains: "Domains",
  workspace: "Workspace",
};

export function isAuditCategory(value: unknown): value is AuditCategory {
  return (
    typeof value === "string" &&
    (AUDIT_CATEGORIES as readonly string[]).includes(value)
  );
}

interface AuditActionInfo {
  category: AuditCategory;
  sentence: string;
}

export const AUDIT_ACTIONS = {
  // Codes, with their folders and tags
  "code.created": { category: "codes", sentence: "Created the code {target}" },
  "code.destination_changed": {
    category: "codes",
    sentence: "Changed the destination of {target}",
  },
  "code.renamed": { category: "codes", sentence: "Renamed the code {target}" },
  "code.style_changed": {
    category: "codes",
    sentence: "Changed the design of {target}",
  },
  "code.link_changed": {
    category: "codes",
    sentence: "Changed the short link of {target}",
  },
  "code.link_controls_changed": {
    category: "codes",
    sentence: "Changed the link controls of {target}",
  },
  "code.routing_changed": {
    category: "codes",
    sentence: "Changed the routing rules of {target}",
  },
  "code.paused": { category: "codes", sentence: "Paused {target}" },
  "code.resumed": { category: "codes", sentence: "Resumed {target}" },
  "code.archived": { category: "codes", sentence: "Archived {target}" },
  "code.unarchived": { category: "codes", sentence: "Unarchived {target}" },
  "code.trashed": {
    category: "codes",
    sentence: "Moved {target} to the trash",
  },
  "code.restored": {
    category: "codes",
    sentence: "Restored {target} from the trash",
  },
  "code.deleted": {
    category: "codes",
    sentence: "Deleted the code {target} for good",
  },
  "code.version_restored": {
    category: "codes",
    sentence: "Restored an earlier version of {target}",
  },
  "code.moved_to_folder": {
    category: "codes",
    sentence: "Moved {target} to another folder",
  },
  "code.moved_out": {
    category: "codes",
    sentence: "Moved {target} to another workspace",
  },
  "code.moved_in": {
    category: "codes",
    sentence: "Moved {target} here from another workspace",
  },
  "folder.created": {
    category: "codes",
    sentence: "Created the folder {target}",
  },
  "folder.renamed": {
    category: "codes",
    sentence: "Renamed the folder {target}",
  },
  "folder.deleted": {
    category: "codes",
    sentence: "Deleted the folder {target}",
  },
  "tag.created": { category: "codes", sentence: "Created the tag {target}" },
  "tag.renamed": { category: "codes", sentence: "Renamed the tag {target}" },
  "tag.deleted": { category: "codes", sentence: "Deleted the tag {target}" },

  // Hosted pages
  "page.created": { category: "pages", sentence: "Created the page {target}" },
  "page.published": { category: "pages", sentence: "Published {target}" },
  "page.deleted": { category: "pages", sentence: "Deleted the page {target}" },

  // Team
  "member.invited": { category: "team", sentence: "Invited {target}" },
  "invitation.revoked": {
    category: "team",
    sentence: "Revoked the invitation for {target}",
  },
  "member.joined": { category: "team", sentence: "Joined the workspace" },
  "member.role_changed": {
    category: "team",
    sentence: "Changed the role of {target}",
  },
  "member.removed": { category: "team", sentence: "Removed {target}" },
  "member.left": { category: "team", sentence: "Left the workspace" },
  "join_link.created": {
    category: "team",
    sentence: "Turned on a new join link",
  },
  "join_link.role_changed": {
    category: "team",
    sentence: "Changed the role the join link gives",
  },
  "join_link.disabled": {
    category: "team",
    sentence: "Turned off the join link",
  },

  // Security
  "sso.created": {
    category: "security",
    sentence: "Set up single sign-on for {target}",
  },
  "sso.updated": {
    category: "security",
    sentence: "Changed the single sign-on connection for {target}",
  },
  "sso.domain_verified": {
    category: "security",
    sentence: "Verified {target} for single sign-on",
  },
  "sso.deleted": {
    category: "security",
    sentence: "Removed single sign-on for {target}",
  },
  "sso_requirement.turned_on": {
    category: "security",
    sentence: "Turned on “Require single sign-on” for {target}",
  },
  "sso_requirement.turned_off": {
    category: "security",
    sentence: "Turned off “Require single sign-on” for {target}",
  },
  "two_factor_requirement.turned_on": {
    category: "security",
    sentence: "Turned on “Require two-step verification”",
  },
  "two_factor_requirement.turned_off": {
    category: "security",
    sentence: "Turned off “Require two-step verification”",
  },
  "sso.join_role_changed": {
    category: "security",
    sentence: "Changed the role people get when they first sign in with SSO",
  },
  "audit_log.exported": {
    category: "security",
    sentence: "Exported the audit log",
  },

  // Developers
  "api_key.created": {
    category: "developers",
    sentence: "Created the API key {target}",
  },
  "api_key.revoked": {
    category: "developers",
    sentence: "Revoked the API key {target}",
  },
  "oauth_app.authorized": {
    category: "developers",
    sentence: "Authorized the app {target}",
  },
  "oauth_app.revoked": {
    category: "developers",
    sentence: "Revoked the app {target}",
  },
  "slack_link.revoked": {
    category: "developers",
    sentence: "Revoked the Slack link for {target}",
  },
  "webhook.created": {
    category: "developers",
    sentence: "Added the webhook endpoint {target}",
  },
  "webhook.updated": {
    category: "developers",
    sentence: "Changed the webhook endpoint {target}",
  },
  "webhook.deleted": {
    category: "developers",
    sentence: "Deleted the webhook endpoint {target}",
  },

  // Domains
  "domain.added": {
    category: "domains",
    sentence: "Added the domain {target}",
  },
  "domain.verified": {
    category: "domains",
    sentence: "Verified the domain {target}",
  },
  "domain.removed": {
    category: "domains",
    sentence: "Removed the domain {target}",
  },

  // Workspace
  "workspace.renamed": {
    category: "workspace",
    sentence: "Renamed the workspace",
  },
  "workspace.slug_changed": {
    category: "workspace",
    sentence: "Changed the workspace URL",
  },
  "workspace.plan_changed": {
    category: "workspace",
    sentence: "The workspace's plan changed",
  },
} as const satisfies Record<string, AuditActionInfo>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ACTION_IDS = Object.keys(AUDIT_ACTIONS) as AuditAction[];

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && Object.hasOwn(AUDIT_ACTIONS, value);
}

/** The actions in a category, for the category filter. */
export function actionsInCategory(category: AuditCategory): AuditAction[] {
  return AUDIT_ACTION_IDS.filter(
    (action) => AUDIT_ACTIONS[action].category === category,
  );
}

/** A category for any recorded action id; null for one this code doesn't know. */
export function auditCategoryOf(action: string): AuditCategory | null {
  return isAuditAction(action) ? AUDIT_ACTIONS[action].category : null;
}

/** What a row targets. */
export type AuditTargetType =
  | "code"
  | "folder"
  | "tag"
  | "page"
  | "member"
  | "invitation"
  | "join_link"
  | "sso"
  | "api_key"
  | "oauth_app"
  | "slack_link"
  | "webhook"
  | "domain"
  | "workspace";

export type AuditActorType =
  | "user"
  | "api_key"
  | "oauth_app"
  | "slack"
  | "system";

/**
 * A row's sentence as parts, so the UI can link the target: text, then the
 * target's name where the sentence names it. Unknown actions (from a newer
 * or older version of the app) read as their id.
 */
export type SentencePart = { text: string } | { target: string };

const UNNAMED: Partial<Record<AuditTargetType, string>> = {
  code: "a code",
  page: "a page",
  folder: "a folder",
  tag: "a tag",
  member: "a member",
  invitation: "someone",
  webhook: "an endpoint",
  domain: "a domain",
  api_key: "a key",
  oauth_app: "an app",
  slack_link: "a Slack account",
  sso: "a domain",
};

export function auditSentenceParts(
  action: string,
  target: { type: string | null; label: string | null },
): SentencePart[] {
  if (!isAuditAction(action)) return [{ text: action }];
  const sentence: string = AUDIT_ACTIONS[action].sentence;
  const label =
    target.label?.trim() ||
    UNNAMED[target.type as AuditTargetType] ||
    "something";
  const parts: SentencePart[] = [];
  const [before, after] = sentence.split("{target}");
  if (before) parts.push({ text: before });
  if (after !== undefined) {
    parts.push({ target: label });
    if (after) parts.push({ text: after });
  }
  return parts;
}

/** The sentence as plain text, for the CSV. */
export function auditSentence(
  action: string,
  target: { type: string | null; label: string | null },
): string {
  return auditSentenceParts(action, target)
    .map((part) => ("text" in part ? part.text : part.target))
    .join("");
}

/** Readable names for the fields in a row's before and after. */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  destinationUrl: "Destination",
  title: "Name",
  name: "Name",
  slug: "URL",
  shortLink: "Short link",
  domain: "Domain",
  folder: "Folder",
  workspace: "Workspace",
  role: "Role",
  plan: "Plan",
  passwordSet: "Password",
  startsAt: "Starts",
  expiresAt: "Expires",
  scanLimit: "Scan limit",
  fallbackUrl: "Fallback URL",
  rules: "Routing rules",
  url: "URL",
  events: "Events",
  active: "Active",
  replaced: "Replaced",
  signedOut: "Sessions signed out",
  scopes: "Scopes",
  expiresInDays: "Expires after (days)",
  email: "Email",
  via: "How",
  protocol: "Protocol",
  filter: "Filter",
  rows: "Rows",
  version: "Version",
  codes: "Codes deleted with it",
  fields: "Settings put back",
  design: "Design",
};

export function auditFieldLabel(field: string): string {
  return (
    AUDIT_FIELD_LABELS[field] ??
    field
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/^./, (first) => first.toUpperCase())
  );
}
