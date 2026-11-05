import "server-only";
import { randomUUID } from "node:crypto";
import { discoverOIDCConfig, type SSOOptions } from "@better-auth/sso";
import * as schema from "@repo/database";
import { database as db, eq } from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { workspacePlanTier } from "./plan";
import {
  domainCovers,
  domainsOverlap,
  emailDomain,
  emailInSsoDomain,
  SSO_TOKEN_PREFIX,
  ssoJoinRoleFromMetadata,
} from "./sso-rules";

// Workspace single sign-on (Business plan). The @better-auth/sso plugin does
// the protocols (OIDC, SAML 2.0), domain verification and account linking;
// this file adds what QRdx needs on top:
// - sign-in only through a verified connection of a workspace on Business,
//   found from the person's work email (never a provider id from the client);
// - a new account only for an address inside the connection's domain;
// - joining the workspace on the first SSO sign-in, with the role the
//   workspace picked (member or viewer).
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
 * Adds someone to the connection's workspace on their first SSO sign-in
 * (when their SSO account link is created), with the workspace's chosen
 * role. Skipped when they're already a member, have a pending invitation
 * (they join through it), or the workspace isn't on Business.
 */
async function joinWorkspace(userId: string, providerId: string) {
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
      columns: { id: true },
      where: (table, { and: all, eq: equals, gt }) =>
        all(
          equals(table.organizationId, organizationId),
          equals(table.email, person.email.toLowerCase()),
          equals(table.status, "pending"),
          gt(table.expiresAt, new Date())
        ),
    }),
    db.query.organization.findFirst({
      columns: { metadata: true },
      where: (table, { eq: equals }) => equals(table.id, organizationId),
    }),
  ]);
  if (existing || invitation || !workspace) return;

  await db
    .insert(schema.member)
    .values({
      id: randomUUID(),
      organizationId,
      userId,
      role: ssoJoinRoleFromMetadata(workspace.metadata),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
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
            account: {
              create: {
                after: async (account, context) => {
                  if (!(context && SSO_CALLBACK_PATHS.includes(context.path))) {
                    return;
                  }
                  try {
                    await joinWorkspace(account.userId, account.providerId);
                  } catch (error) {
                    console.error(
                      "Could not add the SSO user to the workspace",
                      error
                    );
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
