import "server-only";
import { randomUUID } from "node:crypto";
import { discoverOIDCConfig, type SSOOptions } from "@better-auth/sso";
import * as schema from "@repo/database";
import { and, database as db, eq } from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { workspacePlanTier } from "./plan";
import {
  domainCovers,
  domainsOverlap,
  emailDomain,
  emailInSsoDomain,
  SSO_TOKEN_PREFIX,
  ssoFailureRedirect,
  ssoJoinRoleFromMetadata,
} from "./sso-rules";

// Workspace single sign-on (Business plan). The @better-auth/sso plugin does
// the protocols (OIDC, SAML 2.0), domain verification and account linking;
// this file adds what QRdx needs on top:
// - sign-in only through a verified connection of a workspace on Business,
//   found from the person's work email (never a provider id from the client);
// - a new account only for an address inside the connection's domain;
// - joining the workspace at every SSO sign-in (rejoining after a removal,
//   accepting a pending invitation), with the role the workspace picked
//   (member or viewer) or the invitation's.
// Managing connections is server-only (SSO_SERVER_ONLY_PATHS): the app's
// server actions check QRdx roles and the plan first (apps/docs/lib/sso).

export const SSO_SIGN_IN_PATH = "/sign-in/sso";
// Paths that sign someone in. Lane A challenges them for 2FA; here they're
// refused when the workspace is no longer on Business.
const OIDC_CALLBACK_PATH = "/sso/callback/:providerId";
const SAML_ACS_PATH = "/sso/saml2/sp/acs/:providerId";
export const SSO_CALLBACK_PATHS = [OIDC_CALLBACK_PATH, SAML_ACS_PATH];

/** Connection management: only through auth.api, from the app's server actions. */
export const SSO_SERVER_ONLY_PATHS = [
  "/sso/register",
  "/sso/update-provider",
  "/sso/delete-provider",
  "/sso/request-domain-verification",
  "/sso/verify-domain",
  "/sso/providers",
  "/sso/get-provider",
];
// The shared OIDC callback is only used with the plugin's `redirectURI`
// option, which QRdx doesn't set. (Single logout stays off: its two
// endpoints refuse every request while `saml.enableSingleLogout` is unset.)
export const SSO_UNUSED_PATHS = ["/sso/callback"];

/** Error codes the sign-in UI turns into messages (apps/docs/lib/sso/messages.ts). */
export const SSO_ERROR = {
  emailRequired: "SSO_EMAIL_REQUIRED",
  notFound: "SSO_NOT_FOUND",
  unavailable: "SSO_NOT_AVAILABLE",
  outsideDomain: "sso_email_outside_domain",
} as const;

/** Where a refused callback lands (the sign-in page shows the message). */
const UNAVAILABLE_REDIRECT = "/sign-in?error=sso_unavailable";

type ProviderRow = typeof schema.ssoProvider.$inferSelect;

/** Verified connections covering `domain` (one at most: see verifySsoDomain). */
async function verifiedProvidersFor(domain: string): Promise<ProviderRow[]> {
  const rows = await db.query.ssoProvider.findMany({
    where: (table, { eq: equals }) => equals(table.domainVerified, true),
  });
  return rows.filter((row) => domainCovers(row.domain, domain));
}

/** True when the connection may sign people in today. */
export async function ssoProviderUsable(provider: {
  organizationId: string | null;
  domainVerified: boolean | null;
}): Promise<boolean> {
  if (!(provider.domainVerified && provider.organizationId)) return false;
  return (await workspacePlanTier(provider.organizationId)) === "business";
}

async function providerById(providerId: unknown): Promise<ProviderRow | null> {
  if (typeof providerId !== "string") return null;
  const row = await db.query.ssoProvider.findFirst({
    where: (table, { eq: equals }) => equals(table.providerId, providerId),
  });
  return row ?? null;
}

/**
 * Makes sure someone signing in through SSO is a member of the connection's
 * workspace, on every SSO sign-in, so the identity provider decides who's in:
 * someone removed in QRdx comes back the next time their identity provider
 * signs them in. Removing someone for good means unassigning them in the IdP
 * first. Members keep the role
 * they have. A pending invitation is accepted with the role it was sent
 * with (an admin chose it); anyone else joins with the workspace's SSO join
 * role (member or viewer, never owner, admin or billing). Only for an
 * address in the connection's verified domain, while the workspace is on
 * Business.
 */
export async function joinWorkspace(userId: string, providerId: unknown) {
  const provider = await providerById(providerId);
  const organizationId = provider?.organizationId;
  if (!(provider && organizationId && (await ssoProviderUsable(provider)))) {
    return;
  }
  const person = await db.query.user.findFirst({
    columns: { email: true },
    where: (table, { eq: equals }) => equals(table.id, userId),
  });
  if (!(person && emailInSsoDomain(person.email, provider.domain))) return;

  const [existing, invitation, workspace] = await Promise.all([
    db.query.member.findFirst({
      columns: { id: true },
      where: (table, { and: both, eq: equals }) =>
        both(
          equals(table.organizationId, organizationId),
          equals(table.userId, userId)
        ),
    }),
    db.query.invitation.findFirst({
      columns: { id: true, role: true },
      where: (table, { and: all, eq: equals, gt }) =>
        all(
          equals(table.organizationId, organizationId),
          equals(table.email, person.email.toLowerCase()),
          equals(table.status, "pending"),
          gt(table.expiresAt, new Date())
        ),
      orderBy: (table, { desc }) => desc(table.createdAt),
    }),
    db.query.organization.findFirst({
      columns: { metadata: true },
      where: (table, { eq: equals }) => equals(table.id, organizationId),
    }),
  ]);
  if (existing || !workspace) return;

  if (invitation) {
    // Like the organization plugin's accept-invitation: claim the
    // invitation (pending → accepted, so it's accepted once), then add the
    // member with its role; put it back if that fails.
    const [claimed] = await db
      .update(schema.invitation)
      .set({ status: "accepted" })
      .where(
        and(
          eq(schema.invitation.id, invitation.id),
          eq(schema.invitation.status, "pending")
        )
      )
      .returning({ role: schema.invitation.role });
    // Claimed by a sign-in running at the same moment: it adds them.
    if (!claimed) return;
    try {
      await addMember(organizationId, userId, claimed.role || "member");
    } catch (error) {
      await db
        .update(schema.invitation)
        .set({ status: "pending" })
        .where(
          and(
            eq(schema.invitation.id, invitation.id),
            eq(schema.invitation.status, "accepted")
          )
        );
      throw error;
    }
    return;
  }
  await addMember(
    organizationId,
    userId,
    ssoJoinRoleFromMetadata(workspace.metadata)
  );
}

async function addMember(organizationId: string, userId: string, role: string) {
  // Two SSO sign-ins at once: the unique (workspace, user) index keeps one.
  await db
    .insert(schema.member)
    .values({
      id: randomUUID(),
      organizationId,
      userId,
      role,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

/**
 * The verified domains whose people rejoin this workspace at their next SSO
 * sign-in (joinWorkspace), or none when its SSO can't sign anyone in. The
 * team page warns before removing someone in one of them.
 */
export async function ssoRejoinDomains(
  organizationId: string
): Promise<string[]> {
  const providers = await db.query.ssoProvider.findMany({
    columns: { domain: true, domainVerified: true, organizationId: true },
    where: (table, { eq: equals }) =>
      equals(table.organizationId, organizationId),
  });
  const usable = providers.filter((p) => p.domainVerified);
  if (usable.length === 0) return [];
  if ((await workspacePlanTier(organizationId)) !== "business") return [];
  return usable.map((p) => p.domain);
}

/**
 * The workspace an SSO sign-in should open: the connection's, when the
 * person is a member. It's also remembered as their last workspace, so the
 * session made after a two-step challenge (a later request, see
 * ./sign-in-challenge.ts) starts there too (workspace-hooks.ts
 * initialWorkspaceId).
 */
async function ssoWorkspaceFor(
  userId: string,
  providerId: unknown
): Promise<string | null> {
  const provider = await providerById(providerId);
  const organizationId = provider?.organizationId;
  if (!organizationId) return null;
  const membership = await db.query.member.findFirst({
    columns: { id: true },
    where: (table, { and: both, eq: equals }) =>
      both(
        equals(table.organizationId, organizationId),
        equals(table.userId, userId)
      ),
  });
  if (!membership) return null;
  const person = await db.query.user.findFirst({
    columns: { settings: true },
    where: (table, { eq: equals }) => equals(table.id, userId),
  });
  await db
    .update(schema.user)
    .set({
      settings: {
        ...((person?.settings ?? {}) as Record<string, unknown>),
        lastWorkspaceId: organizationId,
      } as typeof schema.user.$inferInsert.settings,
    })
    .where(eq(schema.user.id, userId));
  return organizationId;
}

/** Options for the @better-auth/sso plugin. */
export const ssoOptions = {
  domainVerification: { enabled: true, tokenPrefix: SSO_TOKEN_PREFIX },
  // QRdx provisions itself (joinWorkspace, above): with the plugin's own,
  // a Google or GitHub sign-in from a verified domain would join the
  // workspace too, and only as member or admin.
  organizationProvisioning: { disabled: true },
  // One connection per workspace, enforced by the app's server actions.
  providersLimit: () => Number.POSITIVE_INFINITY,
  saml: {
    // Reject assertions without NotBefore/NotOnOrAfter (SAML2Int).
    requireTimestamps: true,
  },
} satisfies SSOOptions;

/**
 * The checks QRdx adds around the plugin's sign-in endpoints. Registered
 * right after sso() in ./server.ts.
 */
export const ssoGate = () =>
  ({
    id: "qrdx-sso-gate",
    init() {
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                // An SSO sign-in may only create an account for an address in
                // the connection's verified domain; the domain owner's IdP
                // vouches for it, so it counts as verified. (Linking an
                // existing account needs the same match: the plugin's
                // isTrustedProvider.)
                before: async (user, context) => {
                  if (!(context && SSO_CALLBACK_PATHS.includes(context.path))) {
                    return;
                  }
                  const provider = await providerById(
                    context.params?.providerId
                  );
                  if (
                    !(
                      provider?.domainVerified &&
                      emailInSsoDomain(user.email, provider.domain)
                    )
                  ) {
                    throw new APIError("FORBIDDEN", {
                      code: SSO_ERROR.outsideDomain,
                      message:
                        "This address isn't part of the domain this sign-in is set up for.",
                    });
                  }
                  return { data: { ...user, emailVerified: true } };
                },
              },
            },
            session: {
              create: {
                // Join the connection's workspace and open it (runs before
                // the app's own hook in ./server.ts, which then leaves it
                // alone). Before the session exists, so a sign-in that's then
                // challenged for two-step verification has joined too: the
                // IdP has already vouched for the person.
                before: async (session, context) => {
                  if (!(context && SSO_CALLBACK_PATHS.includes(context.path))) {
                    return;
                  }
                  try {
                    // Every SSO sign-in: join, rejoin or accept an
                    // invitation first, so the session can open it.
                    await joinWorkspace(
                      session.userId,
                      context.params?.providerId
                    );
                  } catch (error) {
                    console.error(
                      "Could not add the SSO user to the workspace",
                      error
                    );
                  }
                  try {
                    const organizationId = await ssoWorkspaceFor(
                      session.userId,
                      context.params?.providerId
                    );
                    if (organizationId) {
                      return {
                        data: {
                          ...session,
                          activeOrganizationId: organizationId,
                        },
                      };
                    }
                  } catch (error) {
                    console.error("Could not open the SSO workspace", error);
                  }
                },
              },
            },
          },
        },
      };
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === SSO_SIGN_IN_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            // Only the work email picks the connection.
            if (body.providerId || body.domain || body.organizationSlug) {
              throw new APIError("BAD_REQUEST", {
                code: SSO_ERROR.emailRequired,
                message: "Enter your work email.",
              });
            }
            const domain =
              typeof body.email === "string" ? emailDomain(body.email) : null;
            if (!domain) {
              throw new APIError("BAD_REQUEST", {
                code: SSO_ERROR.emailRequired,
                message: "Enter your work email.",
              });
            }
            const providers = await verifiedProvidersFor(domain);
            const [provider] = providers;
            if (!provider || providers.length > 1) {
              throw new APIError("NOT_FOUND", {
                code: SSO_ERROR.notFound,
                message: `No SSO is set up for ${domain}.`,
              });
            }
            if (!(await ssoProviderUsable(provider))) {
              throw new APIError("FORBIDDEN", {
                code: SSO_ERROR.unavailable,
                message: `SSO for ${domain} isn't available right now. Sign in another way.`,
              });
            }
            return {
              context: { body: { ...body, providerId: provider.providerId } },
            };
          }),
        },
        {
          // The plan can change between starting and finishing a sign-in.
          matcher: (ctx) => SSO_CALLBACK_PATHS.includes(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            // ACS by GET only forwards someone already signed in.
            if (ctx.path === SAML_ACS_PATH && ctx.method === "GET") return;
            const provider = await providerById(ctx.params?.providerId);
            if (provider && (await ssoProviderUsable(provider))) return;
            // Relative, so it works without a fixed base URL too.
            throw ctx.redirect(UNAVAILABLE_REDIRECT);
          }),
        },
      ],
      after: [
        {
          // A refused sign-in lands on /sign-in?next=…&error=… for both
          // protocols (ssoFailureRedirect).
          matcher: (ctx) => SSO_CALLBACK_PATHS.includes(ctx.path ?? ""),
          handler: createAuthMiddleware((ctx) => {
            if (ctx.context.newSession) return Promise.resolve();
            const returned = ctx.context.returned;
            if (!(isAPIError(returned) && returned.statusCode === 302)) {
              return Promise.resolve();
            }
            const location =
              ctx.context.responseHeaders?.get("location") ??
              new Headers(returned.headers).get("location");
            let appOrigin: string;
            try {
              appOrigin = new URL(ctx.context.baseURL).origin;
            } catch {
              return Promise.resolve();
            }
            const target = ssoFailureRedirect(location, appOrigin);
            if (target) throw ctx.redirect(target);
            return Promise.resolve();
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

export interface DiscoveredOidcEndpoints {
  issuer: string;
  discoveryEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  userInfoEndpoint?: string;
  tokenEndpointAuthentication?: "client_secret_basic" | "client_secret_post";
}

/**
 * Reads the IdP's OpenID configuration with the plugin's own discovery
 * (issuer match, required fields, private-host and redirect checks). The
 * plugin only accepts discovery and endpoint URLs from trusted origins;
 * `isAllowedUrl` admits the customer's IdP (the app passes public https
 * hosts, after checking the issuer resolves to a public address).
 */
export async function discoverOidcEndpoints(
  issuer: string,
  isTrustedOrigin: (url: string) => boolean,
  isAllowedUrl: (url: string) => boolean
): Promise<DiscoveredOidcEndpoints> {
  const config = await discoverOIDCConfig({
    issuer,
    isTrustedOrigin: (url) => isTrustedOrigin(url) || isAllowedUrl(url),
  });
  if (!(config.authorizationEndpoint && config.tokenEndpoint)) {
    throw new Error("The identity provider's configuration is incomplete.");
  }
  if (!config.jwksEndpoint) {
    throw new Error("The identity provider doesn't publish signing keys.");
  }
  const auth = config.tokenEndpointAuthentication;
  return {
    issuer: config.issuer,
    discoveryEndpoint: config.discoveryEndpoint,
    authorizationEndpoint: config.authorizationEndpoint,
    tokenEndpoint: config.tokenEndpoint,
    jwksEndpoint: config.jwksEndpoint,
    userInfoEndpoint: config.userInfoEndpoint,
    tokenEndpointAuthentication:
      auth === "client_secret_post" || auth === "client_secret_basic"
        ? auth
        : undefined,
  };
}

/** True when another workspace's verified connection overlaps `domain`. */
export async function verifiedDomainTakenElsewhere(
  domain: string,
  organizationId: string
): Promise<boolean> {
  const rows = await db.query.ssoProvider.findMany({
    columns: { domain: true, organizationId: true },
    where: (table, { eq: equals }) => equals(table.domainVerified, true),
  });
  return rows.some(
    (row) =>
      row.organizationId !== organizationId &&
      domainsOverlap(row.domain, domain)
  );
}

/** Undo a verification (used when two workspaces raced for one domain). */
export async function unverifySsoDomain(providerId: string): Promise<void> {
  await db
    .update(schema.ssoProvider)
    .set({ domainVerified: false })
    .where(eq(schema.ssoProvider.providerId, providerId));
}
