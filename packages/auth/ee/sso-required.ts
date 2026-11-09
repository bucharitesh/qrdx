import "server-only";
import { database as db } from "@repo/database";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { cookieFrom } from "../confirm-sign-in";
import { workspacePlanTier } from "../plan";
import { CHALLENGE_COMPLETION_PATHS } from "../sign-in-challenge-rules";
import { TWO_FACTOR_COOKIE } from "../sign-in-challenge-session";
import { SSO_CALLBACK_PATHS } from "./sso";
import {
  coveringDomains,
  type EmailChangeSsoProblem,
  holdsOwnerRole,
  isChallengeIdentifier,
  parseSsoMarker,
  type SessionCreation,
  SSO_REQUIRED_ERROR,
  SSO_SESSION_MS,
  type SsoMarker,
  sessionCreationVerdict,
  ssoChallengeIdentifier,
  ssoMarkerValue,
  ssoRequiredProviderId,
  ssoSessionIdentifier,
} from "./sso-required-rules";
import { emailDomain, emailInSsoDomain } from "./sso-rules";

// "Require single sign-on for <domain>" (./sso-required-rules.ts has the
// rules). This file is the server side:
// - findSsoRequirement / boundSsoRequirement: whether SSO is required for an
//   address, and for a person (the workspace's owners are exempt);
// - ssoRequirementGate: the Better Auth plugin that enforces it at sign-in,
//   marks SSO sessions, caps them at 24 hours and ends the rest;
// - turning it on ends existing sessions that didn't come from SSO
//   (apps/docs/ee/sso/required.ts, endSessionsWithoutSso);
// - emailChangeSsoProblem: no email change onto or off a required domain.
// Registered right after ssoGate in ../server.ts (licensed servers only).

/** A verified connection whose workspace requires SSO, on Business. */
export interface SsoRequirement {
  providerId: string;
  organizationId: string;
  domain: string;
}

interface VerifiedConnection {
  providerId: string;
  organizationId: string | null;
  domain: string;
  required: boolean;
}

// ─── Lookups ────────────────────────────────────────────────────────────────
//
// Sign-ins, settings and email changes look up afresh. Reading the session
// (every page) uses a short in-memory cache: the requirement changes rarely,
// and turning it on ends the sessions it affects there and then
// (apps/docs/ee/sso/required.ts), so the cache only delays the rarer cases
// (an owner who stops being one, a workspace back on Business) by up to a
// minute. clearSsoRequirementCache only clears this server's copy, so after
// the requirement stops (turned off, connection removed, workspace off
// Business) another server can still end a fresh non-SSO session for up to
// a minute; the help page says so (single-sign-on.mdx, "Turning it off").

const CACHE_MS = 60_000;

class TtlCache<T> {
  private readonly entries = new Map<
    string,
    { at: number; value: Promise<T> }
  >();
  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && now - hit.at < CACHE_MS) return hit.value;
    const value = load();
    this.entries.set(key, { at: now, value });
    // A failed lookup isn't kept; the caller sees the failure.
    value.catch(() => this.entries.delete(key));
    return value;
  }
  clear() {
    this.entries.clear();
  }
}

const connectionsCache = new TtlCache<VerifiedConnection[]>();
const planCache = new TtlCache<boolean>();
const ownerCache = new TtlCache<boolean>();

/** Forgets cached lookups (after a change here, and in tests). */
export function clearSsoRequirementCache(): void {
  connectionsCache.clear();
  planCache.clear();
  ownerCache.clear();
}

/** Verified connections (all, or those whose domain is in `domains`). */
async function verifiedConnections(
  domains?: string[]
): Promise<VerifiedConnection[]> {
  const providers = await db.query.ssoProvider.findMany({
    columns: { providerId: true, organizationId: true, domain: true },
    where: (table, { and: both, eq: equals, inArray: within }) =>
      domains
        ? both(
            equals(table.domainVerified, true),
            within(table.domain, domains)
          )
        : equals(table.domainVerified, true),
  });
  const organizationIds = [
    ...new Set(
      providers
        .map((p) => p.organizationId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const workspaces = organizationIds.length
    ? await db.query.organization.findMany({
        columns: { id: true, metadata: true },
        where: (table, { inArray: within }) =>
          within(table.id, organizationIds),
      })
    : [];
  const requiredBy = new Map(
    workspaces.map((w) => [w.id, ssoRequiredProviderId(w.metadata)])
  );
  return providers.map((p) => ({
    providerId: p.providerId,
    organizationId: p.organizationId,
    domain: p.domain,
    required: Boolean(
      p.organizationId && requiredBy.get(p.organizationId) === p.providerId
    ),
  }));
}

const onBusiness = async (organizationId: string) =>
  (await workspacePlanTier(organizationId)) === "business";

async function isOwner(organizationId: string, userId: string) {
  const row = await db.query.member.findFirst({
    columns: { role: true },
    where: (table, { and: both, eq: equals }) =>
      both(
        equals(table.organizationId, organizationId),
        equals(table.userId, userId)
      ),
  });
  return holdsOwnerRole(row?.role);
}

interface LookupOptions {
  /** Read the database now instead of the cache (sign-ins, settings). */
  fresh?: boolean;
}

/**
 * The requirement that applies to an address, or null: exactly one verified
 * connection covers its domain (as for signing in, ./sso.ts), its workspace
 * requires SSO for it and is on Business. Says nothing about the person, so
 * it's the same for everyone at that domain, with an account or without.
 */
export async function findSsoRequirement(
  email: string,
  { fresh = false }: LookupOptions = {}
): Promise<SsoRequirement | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  const covering = coveringDomains(domain);
  const connections = fresh
    ? await verifiedConnections(covering)
    : (await connectionsCache.get("all", () => verifiedConnections())).filter(
        (c) => covering.includes(c.domain)
      );
  if (connections.length !== 1) return null;
  const [connection] = connections;
  if (!(connection?.required && connection.organizationId)) return null;
  const organizationId = connection.organizationId;
  const business = fresh
    ? await onBusiness(organizationId)
    : await planCache.get(organizationId, () => onBusiness(organizationId));
  if (!business) return null;
  return {
    providerId: connection.providerId,
    organizationId,
    domain: connection.domain,
  };
}

/** Whether a sign-in with an address at `domain` must use SSO (domain only). */
export async function ssoRequiredForDomain(domain: string): Promise<boolean> {
  return (await findSsoRequirement(`x@${domain}`, { fresh: true })) !== null;
}

/**
 * The requirement that binds this person, or null: one applies to their
 * address and they aren't an owner of the workspace that set it (owners keep
 * their other sign-in methods, so a broken identity provider can't lock
 * everyone out).
 */
export async function boundSsoRequirement(
  userId: string,
  email: string,
  { fresh = false }: LookupOptions = {}
): Promise<SsoRequirement | null> {
  const requirement = await findSsoRequirement(email, { fresh });
  if (!requirement) return null;
  const { organizationId } = requirement;
  const owner = fresh
    ? await isOwner(organizationId, userId)
    : await ownerCache.get(`${organizationId}:${userId}`, () =>
        isOwner(organizationId, userId)
      );
  return owner ? null : requirement;
}

// ─── Session markers ────────────────────────────────────────────────────────

type InternalAdapter = GenericEndpointContext["context"]["internalAdapter"];

interface LiveMarker extends SsoMarker {
  expiresAt: Date;
}

async function readMarker(
  adapter: InternalAdapter,
  identifier: string
): Promise<LiveMarker | null> {
  const row = (await adapter.findVerificationValue(identifier)) as {
    value?: unknown;
    expiresAt?: Date | string;
  } | null;
  if (!row?.expiresAt) return null;
  const expiresAt = new Date(row.expiresAt);
  if (expiresAt.getTime() <= Date.now()) return null;
  const marker = parseSsoMarker(row.value);
  return marker ? { ...marker, expiresAt } : null;
}

// ─── Refusals ───────────────────────────────────────────────────────────────

export function ssoRequiredError(): APIError {
  return new APIError("FORBIDDEN", {
    code: SSO_REQUIRED_ERROR,
    message:
      "Your company requires single sign-on for this address. Sign in with SSO.",
  });
}

// No ids, emails or addresses in these logs.
function log(fields: Record<string, unknown>) {
  console.info(JSON.stringify({ event: "auth.sso_required", ...fields }));
}

/** Sign-ups by other means: an email code, Google or GitHub. */
const OTHER_SIGN_UP_PATHS = new Set([
  "/sign-in/email-otp",
  "/callback/:id",
  "/sign-in/social",
]);

/** The pending challenge this request finishes, from its cookie. */
function challengeId(context: GenericEndpointContext): string | null {
  const name = context.context.createAuthCookie(TWO_FACTOR_COOKIE).name;
  const value = cookieFrom(context, name);
  if (!value) return null;
  // Signed: "<id>.<signature>". The challenge endpoints check the signature
  // before any session is made; only the id is needed here.
  const dot = value.lastIndexOf(".");
  return dot > 0 ? value.slice(0, dot) : null;
}

const creations = new WeakMap<object, Promise<SessionCreation>>();

/** How this request is making a session (read once per request). */
function describeCreation(
  context: GenericEndpointContext
): Promise<SessionCreation> {
  const cached = creations.get(context);
  if (cached) return cached;
  const described = (async (): Promise<SessionCreation> => {
    const path = context.path ?? "";
    const adapter = context.context.internalAdapter;
    const providerParam = (context.params as { providerId?: unknown } | null)
      ?.providerId;
    const ssoCallbackProviderId = SSO_CALLBACK_PATHS.includes(path)
      ? typeof providerParam === "string"
        ? providerParam
        : ""
      : null;
    const serverSide = !(context.request instanceof Request);
    // Better Auth's session middleware puts the request's session here.
    const current = (
      context.context as { session?: { session?: { id?: unknown } } | null }
    ).session?.session;
    // The same endpoints also confirm a new authenticator app for someone
    // signed in (Settings, server-side), which swaps their session: that's
    // not finishing a challenge.
    const completesChallenge =
      CHALLENGE_COMPLETION_PATHS.includes(path) &&
      typeof current?.id !== "string";
    const id = completesChallenge ? challengeId(context) : null;
    const challengeMarker = id
      ? await readMarker(adapter, ssoChallengeIdentifier(id))
      : null;
    const currentSessionMarker =
      serverSide && typeof current?.id === "string"
        ? await readMarker(adapter, ssoSessionIdentifier(current.id))
        : null;
    return {
      ssoCallbackProviderId,
      completesChallenge,
      challengeMarker,
      serverSide,
      currentSessionMarker,
    };
  })();
  creations.set(context, described);
  return described;
}

/** The SSO marker a new session gets, if it came from SSO, and its end. */
function markerFor(
  creation: SessionCreation,
  userId: string
): { providerId: string; expiresAt: Date } | null {
  const fromSignIn = () => new Date(Date.now() + SSO_SESSION_MS);
  if (creation.ssoCallbackProviderId) {
    return {
      providerId: creation.ssoCallbackProviderId,
      expiresAt: fromSignIn(),
    };
  }
  if (creation.completesChallenge) {
    const marker = creation.challengeMarker;
    return marker?.userId === userId
      ? { providerId: marker.providerId, expiresAt: fromSignIn() }
      : null;
  }
  const current = creation.currentSessionMarker;
  if (creation.serverSide && current?.userId === userId) {
    // A swap keeps the sign-in's end, never a new 24 hours.
    return { providerId: current.providerId, expiresAt: current.expiresAt };
  }
  return null;
}

// ─── Reading a session ──────────────────────────────────────────────────────

interface FoundSession {
  session: { id: string; token: string; userId: string; expiresAt: Date };
  user: { id: string; email: string };
}

function isFoundSession(value: unknown): value is FoundSession {
  const found = value as Partial<FoundSession> | null;
  return Boolean(
    found &&
      typeof found === "object" &&
      typeof found.session?.id === "string" &&
      typeof found.session.token === "string" &&
      typeof found.user?.id === "string" &&
      typeof found.user.email === "string"
  );
}

/**
 * What to do with a session someone SSO is required for: keep it, end it
 * (no live SSO marker through the required connection: it didn't come from
 * SSO, or its 24 hours are up), or keep it and bring its expiry down to the
 * marker's (Better Auth's refresh moved it out).
 */
export async function sessionVerdict(
  found: FoundSession,
  adapter: InternalAdapter
): Promise<
  { action: "keep" } | { action: "end" } | { action: "cap"; to: Date }
> {
  const requirement = await boundSsoRequirement(
    found.user.id,
    found.user.email
  );
  if (!requirement) return { action: "keep" };
  const marker = await readMarker(
    adapter,
    ssoSessionIdentifier(found.session.id)
  );
  if (
    !marker ||
    marker.userId !== found.user.id ||
    marker.providerId !== requirement.providerId
  ) {
    return { action: "end" };
  }
  if (
    new Date(found.session.expiresAt).getTime() > marker.expiresAt.getTime()
  ) {
    return { action: "cap", to: marker.expiresAt };
  }
  return { action: "keep" };
}

// ─── The plugin ─────────────────────────────────────────────────────────────

const ORGANIZATION_UPDATE_PATH = "/organization/update";

/**
 * Enforces the requirement inside Better Auth. Registered after ssoGate
 * (../server.ts).
 *
 * - A new account by an email code, Google or GitHub at a required domain is
 *   refused; so is a new session for someone SSO is required for, unless it
 *   comes from the required connection (directly, or by finishing the
 *   two-step challenge such a sign-in started), or is the app swapping an SSO
 *   session server-side (sessionCreationVerdict).
 * - Every session that comes from SSO gets a marker for 24 hours (anyone's,
 *   so turning the requirement on later knows which sessions to keep), and
 *   for someone SSO is required for, the session itself ends by then too.
 * - Reading the session (/get-session, which every page and auth.api
 *   getSession call goes through) ends one that has no live marker, and
 *   brings back an expiry Better Auth's refresh moved past the marker.
 * - Workspace metadata (where the setting lives, with the SSO join role)
 *   can't be changed over HTTP; the app's server actions change it through
 *   auth.api after their own checks ("Confirm it's you").
 */
export const ssoRequirementGate = () =>
  ({
    id: "qrdx-sso-requirement",
    init() {
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                before: async (user, context) => {
                  if (!context) return;
                  if (!OTHER_SIGN_UP_PATHS.has(context.path ?? "")) return;
                  if (
                    typeof user.email === "string" &&
                    (await findSsoRequirement(user.email, { fresh: true }))
                  ) {
                    log({ outcome: "refused-sign-up", path: context.path });
                    throw ssoRequiredError();
                  }
                },
              },
            },
            session: {
              create: {
                before: async (session, context) => {
                  if (!context) return;
                  const user =
                    await context.context.internalAdapter.findUserById(
                      session.userId
                    );
                  if (!user?.email) return;
                  const requirement = await boundSsoRequirement(
                    session.userId,
                    user.email,
                    { fresh: true }
                  );
                  if (!requirement) return;
                  const creation = await describeCreation(context);
                  const verdict = sessionCreationVerdict(
                    creation,
                    session.userId,
                    requirement.providerId
                  );
                  if (verdict === "refuse") {
                    log({ outcome: "refused-sign-in", path: context.path });
                    throw ssoRequiredError();
                  }
                  const end = markerFor(creation, session.userId)?.expiresAt;
                  if (
                    end &&
                    new Date(session.expiresAt).getTime() > end.getTime()
                  ) {
                    return { data: { ...session, expiresAt: end } };
                  }
                },
                after: async (session, context) => {
                  if (!(context && session?.id)) return;
                  try {
                    const marker = markerFor(
                      await describeCreation(context),
                      session.userId
                    );
                    if (!marker) return;
                    await context.context.internalAdapter.createVerificationValue(
                      {
                        identifier: ssoSessionIdentifier(session.id),
                        value: ssoMarkerValue({
                          userId: session.userId,
                          providerId: marker.providerId,
                        }),
                        expiresAt: marker.expiresAt,
                      }
                    );
                  } catch (error) {
                    console.error(
                      JSON.stringify({
                        event: "auth.sso_required",
                        outcome: "marker-failed",
                        error: error instanceof Error ? error.name : "unknown",
                      })
                    );
                  }
                },
              },
              update: {
                // Better Auth's refresh pushes the expiry out by its full
                // lifetime; for someone SSO is required for, never past the
                // end of their SSO sign-in's 24 hours.
                before: async (data, context) => {
                  if (!(context && data?.expiresAt)) return;
                  const found = (context.context as { session?: unknown })
                    .session;
                  if (!isFoundSession(found)) return;
                  const marker = await readMarker(
                    context.context.internalAdapter,
                    ssoSessionIdentifier(found.session.id)
                  );
                  if (!marker) return;
                  // The cache may not have seen the requirement yet (just
                  // turned on, or another server instance did it): an SSO
                  // session's refresh is rare enough to look again.
                  const requirement =
                    (await boundSsoRequirement(
                      found.user.id,
                      found.user.email
                    )) ??
                    (await boundSsoRequirement(
                      found.user.id,
                      found.user.email,
                      { fresh: true }
                    ));
                  if (requirement?.providerId !== marker.providerId) return;
                  if (
                    new Date(data.expiresAt).getTime() >
                    marker.expiresAt.getTime()
                  ) {
                    return { data: { ...data, expiresAt: marker.expiresAt } };
                  }
                },
              },
            },
            verification: {
              create: {
                // A two-step challenge started by an SSO sign-in: remember
                // the connection, for the session its second step makes.
                after: async (row, context) => {
                  if (!(context && row)) return;
                  if (!SSO_CALLBACK_PATHS.includes(context.path ?? "")) return;
                  if (!isChallengeIdentifier(row.identifier)) return;
                  const providerId = (
                    context.params as { providerId?: unknown } | null
                  )?.providerId;
                  if (typeof providerId !== "string") return;
                  await context.context.internalAdapter.createVerificationValue(
                    {
                      identifier: ssoChallengeIdentifier(row.identifier),
                      value: ssoMarkerValue({ userId: row.value, providerId }),
                      expiresAt: new Date(row.expiresAt),
                    }
                  );
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
          matcher: (ctx) =>
            ctx.path === ORGANIZATION_UPDATE_PATH &&
            ctx.request instanceof Request,
          handler: createAuthMiddleware((ctx) => {
            const data = (ctx.body as { data?: { metadata?: unknown } } | null)
              ?.data;
            if (data && data.metadata !== undefined) {
              throw new APIError("FORBIDDEN", {
                message: "Change workspace settings in QRdx.",
              });
            }
            return Promise.resolve();
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned;
            if (isAPIError(returned) || !isFoundSession(returned)) return;
            let verdict: Awaited<ReturnType<typeof sessionVerdict>>;
            try {
              verdict = await sessionVerdict(
                returned,
                ctx.context.internalAdapter
              );
            } catch (error) {
              console.error(
                JSON.stringify({
                  event: "auth.sso_required",
                  outcome: "check-failed",
                  error: error instanceof Error ? error.name : "unknown",
                })
              );
              return;
            }
            if (verdict.action === "keep") return;
            if (verdict.action === "end") {
              await ctx.context.internalAdapter.deleteSession(
                returned.session.token
              );
              deleteSessionCookie(ctx);
              log({ outcome: "ended-session" });
              return ctx.json(null);
            }
            await ctx.context.internalAdapter.updateSession(
              returned.session.token,
              { expiresAt: verdict.to }
            );
            return ctx.json({
              ...returned,
              session: { ...returned.session, expiresAt: verdict.to },
            });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

// ─── Email changes ──────────────────────────────────────────────────────────

/**
 * Why an email change can't go ahead, or null: moving off a domain that
 * requires SSO for the person (they'd escape the identity provider), or onto
 * one (that address signs in with SSO, which makes or links the account
 * itself). Owners of the requiring workspace are exempt, as at sign-in.
 */
export async function emailChangeSsoProblem(
  userId: string,
  from: string,
  to: string
): Promise<EmailChangeSsoProblem | null> {
  const off = await boundSsoRequirement(userId, from, { fresh: true });
  if (off && !emailInSsoDomain(to, off.domain)) {
    return { kind: "off", domain: off.domain };
  }
  const onto = await boundSsoRequirement(userId, to, { fresh: true });
  if (onto && !emailInSsoDomain(from, onto.domain)) {
    return { kind: "onto", domain: onto.domain };
  }
  return null;
}
