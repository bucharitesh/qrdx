// Where /settings/portal sends the browser: the Polar customer portal when it
// opens, otherwise a page on this site that says what to do next. No
// server-only imports, so every outcome is unit tested directly.

import { DEFAULT_LOGIN_REDIRECT } from "@/routes";

/** Signed-out visitors land where they can sign in. */
export const SIGNED_OUT_PATH = DEFAULT_LOGIN_REDIRECT;
/** Users who never checked out have no Polar customer, so no portal. */
export const NO_CUSTOMER_PATH = "/pricing";
/** The usage page shows "Billing portal is unavailable right now" for this. */
export const PORTAL_UNAVAILABLE_PATH = "/settings/usage?billing=unavailable";
/** Where the portal's back button returns to. */
export const PORTAL_RETURN_PATH = "/settings/usage";

/** The slice of the Polar SDK this route uses. */
export interface PortalClient {
  customers: {
    getExternal(request: { externalId: string }): Promise<{ id: string }>;
  };
  customerSessions: {
    create(request: {
      customerId: string;
      returnUrl?: string | null;
    }): Promise<{ customerPortalUrl: string }>;
  };
}

/** Logged when the portal can't open: names and status codes, never secrets. */
export interface PortalFailure {
  stage: "config" | "customer" | "session";
  error?: string;
  status?: number;
}

export interface ResolvePortalOptions {
  /** Null when no Polar access token is configured. */
  client: PortalClient | null;
  /** The signed-in user's id; throws (or returns nothing) when signed out. */
  getUserId: () => Promise<string | null | undefined>;
  /** Absolute URL the portal's back button returns to. */
  returnUrl?: string;
  onFailure?: (failure: PortalFailure) => void;
}

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
};

const nameOf = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error;

const isNotFound = (error: unknown) =>
  statusOf(error) === 404 || nameOf(error) === "ResourceNotFound";

/**
 * The URL to redirect to: the portal's own (absolute), or a path on this site.
 * Never throws. Polar errors carry the request (and its Authorization header),
 * so only their name and status code are passed to `onFailure`.
 */
export async function resolvePortalRedirect({
  client,
  getUserId,
  returnUrl,
  onFailure,
}: ResolvePortalOptions): Promise<string> {
  let userId: string | null | undefined;
  try {
    userId = await getUserId();
  } catch {
    userId = null;
  }
  if (!userId) return SIGNED_OUT_PATH;

  if (!client) {
    onFailure?.({ stage: "config", error: "POLAR_ACCESS_TOKEN not set" });
    return PORTAL_UNAVAILABLE_PATH;
  }

  let customerId: string;
  try {
    const customer = await client.customers.getExternal({
      externalId: userId,
    });
    customerId = customer.id;
  } catch (error) {
    if (isNotFound(error)) return NO_CUSTOMER_PATH;
    onFailure?.({
      stage: "customer",
      error: nameOf(error),
      status: statusOf(error),
    });
    return PORTAL_UNAVAILABLE_PATH;
  }

  try {
    const { customerPortalUrl } = await client.customerSessions.create({
      customerId,
      returnUrl,
    });
    if (!customerPortalUrl) throw new Error("No customerPortalUrl");
    return customerPortalUrl;
  } catch (error) {
    onFailure?.({
      stage: "session",
      error: nameOf(error),
      status: statusOf(error),
    });
    return PORTAL_UNAVAILABLE_PATH;
  }
}
