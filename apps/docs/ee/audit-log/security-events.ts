import "server-only";

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { database as db, oauthApp } from "@repo/database";
import { eq } from "drizzle-orm";
import { changedFields, hasChanges } from "@/ee/audit-log/metadata";
import { recordAuditEvent } from "@/ee/audit-log/record";
import { WORKSPACE_ROLE_LABELS, type WorkspaceRole } from "@/lib/permissions";

// Audit log events for single sign-on (ee/sso/connections.ts), the
// workspace's sign-in requirements and OAuth apps, one line at each change.
// Only the domain, the protocol and which credential was replaced are kept:
// never a client secret or a certificate.

type Scope = { userId: string; organizationId: string };

interface Connection {
  providerId: string;
  domain: string;
  samlConfig?: string | null;
}

export function auditSso(
  scope: Scope,
  action: "sso.created" | "sso.updated" | "sso.domain_verified" | "sso.deleted",
  connection: Connection,
  /** sso.updated: the credential replaced, by protocol (never its value) */
  replacedFor?: "oidc" | "saml",
): void {
  recordAuditEvent(scope, {
    action,
    target: {
      type: "sso",
      id: connection.providerId,
      label: connection.domain,
    },
    metadata: {
      protocol: connection.samlConfig ? "SAML" : "OIDC",
      ...(replacedFor && {
        replaced:
          replacedFor === "oidc" ? "Client secret" : "Signing certificate",
      }),
    },
  });
}

export function auditSsoJoinRole(scope: Scope, from: string, to: string) {
  const label = (role: string) =>
    WORKSPACE_ROLE_LABELS[role as WorkspaceRole] ?? role;
  const change = changedFields({ role: label(from) }, { role: label(to) });
  if (!hasChanges(change)) return;
  recordAuditEvent(scope, {
    action: "sso.join_role_changed",
    target: { type: "sso", id: scope.organizationId },
    metadata: change,
  });
}

/**
 * An OAuth app was authorized or revoked by a person. OAuth tokens act on
 * the person's own workspace (app/api/v1/codes/_lib/api.ts), so that's
 * where it's recorded.
 */
export function auditOAuthApp(
  userId: string,
  action: "oauth_app.authorized" | "oauth_app.revoked",
  app: { id: string; name?: string | null },
  scopes?: readonly string[],
): void {
  recordAuditEvent(
    { userId, organizationId: ownWorkspaceId(userId) },
    async () => [
      {
        action,
        target: {
          type: "oauth_app",
          id: app.id,
          label: app.name ?? (await oauthAppName(app.id)),
        },
        ...(scopes && { metadata: { scopes: [...scopes] } }),
      },
    ],
  );
}

async function oauthAppName(appId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: oauthApp.name })
    .from(oauthApp)
    .where(eq(oauthApp.id, appId))
    .limit(1);
  return row?.name ?? null;
}

/**
 * "Require single sign-on" turned on or off (ee/sso/connections.ts), when it
 * changed. `why` says how, when it wasn't the switch itself.
 */
export function auditSsoRequirement(
  scope: Scope,
  connection: Connection,
  was: boolean,
  now: boolean,
  details?: { signedOut?: number; via?: string },
): void {
  if (was === now) return;
  recordAuditEvent(scope, {
    action: now ? "sso_requirement.turned_on" : "sso_requirement.turned_off",
    target: {
      type: "sso",
      id: connection.providerId,
      label: connection.domain,
    },
    ...(details && { metadata: details }),
  });
}

/** "Require two-step verification" turned on or off, when it changed. */
export function auditTwoFactorRequirement(
  scope: Scope,
  was: boolean,
  now: boolean,
): void {
  if (was === now) return;
  recordAuditEvent(scope, {
    action: now
      ? "two_factor_requirement.turned_on"
      : "two_factor_requirement.turned_off",
    target: { type: "workspace", id: scope.organizationId },
  });
}
