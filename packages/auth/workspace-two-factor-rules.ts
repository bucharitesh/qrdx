// "Require two-step verification" for a workspace (Business): pure and
// client-safe. The server side is ./workspace-two-factor.ts; the app's guard
// is apps/docs/lib/scope.ts, its setting the Team page.
//
// While it applies, a member without two-step verification can't open the
// workspace or act in it with a session (pages, server actions, the app's
// routes and Better Auth's workspace endpoints) until they turn it on. Their
// other workspaces work as usual. API keys and OAuth tokens aren't sessions
// and keep working (see the app's lib/scope.ts for why).

/** Key in the workspace's metadata (organization.metadata, JSON): true when required. */
export const REQUIRE_TWO_FACTOR_METADATA_KEY = "requireTwoFactor";

/** The error code a refused request carries. */
export const TWO_FACTOR_REQUIRED = "TWO_FACTOR_REQUIRED";

export const TWO_FACTOR_REQUIRED_MESSAGE =
  "This workspace requires two-step verification. Turn it on in Settings, under Profile & security, then try again.";

/** Workspace metadata as an object (Better Auth stores it as a JSON string). */
export function workspaceMetadataObject(
  metadata: unknown
): Record<string, unknown> {
  let value = metadata;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Whether the workspace's setting is on. It applies only while the
 * workspace is on Business (./workspace-two-factor.ts checks the plan).
 */
export function twoFactorRequiredIn(metadata: unknown): boolean {
  return (
    workspaceMetadataObject(metadata)[REQUIRE_TWO_FACTOR_METADATA_KEY] === true
  );
}

/** The metadata with the setting changed; every other key is kept. */
export function withTwoFactorRequired(
  metadata: unknown,
  required: boolean
): Record<string, unknown> {
  const next = { ...workspaceMetadataObject(metadata) };
  if (required) next[REQUIRE_TWO_FACTOR_METADATA_KEY] = true;
  else delete next[REQUIRE_TWO_FACTOR_METADATA_KEY];
  return next;
}

/**
 * Better Auth's workspace endpoints that never read or change a workspace's
 * contents: making one, checking a URL, listing your own, switching the
 * session's workspace, leaving one, and answering an invitation addressed to
 * you. Every other /organization/* endpoint acts on a workspace and is
 * refused while it shuts the person out, including ones added later.
 */
export const WORKSPACE_FREE_ORGANIZATION_PATHS: ReadonlySet<string> = new Set([
  "/organization/create",
  "/organization/check-slug",
  "/organization/list",
  "/organization/set-active",
  "/organization/leave",
  "/organization/get-invitation",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/list-user-invitations",
]);

/** True for a Better Auth endpoint that acts on a workspace. */
export function organizationPathActsOnWorkspace(path: string): boolean {
  return (
    path.startsWith("/organization/") &&
    !WORKSPACE_FREE_ORGANIZATION_PATHS.has(path)
  );
}
