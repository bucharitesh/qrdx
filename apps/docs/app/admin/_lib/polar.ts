import "server-only";

import { env } from "@/lib/env";
import { isBillingConfigured, polar } from "@/lib/polar";
import { cached, withTimeout } from "./cache";
import { polarCustomerUrl } from "./rules";

export interface PolarProbe {
  ok: boolean;
  detail: string;
  organizationSlug: string | null;
}

const sandbox = env.NODE_ENV !== "production";
const errorText = (error: unknown) =>
  error instanceof Error ? error.message.split("\n")[0].slice(0, 160) : "error";

/**
 * One light read with the access token: the organization it belongs to
 * (needs organizations:read), else one customer (customers:read) to tell a
 * scoped token from a broken one. Cached for 60 s.
 */
export function probePolar(): Promise<PolarProbe> {
  return cached("polar", 60_000, async () => {
    if (!isBillingConfigured) {
      return {
        ok: false,
        detail: "POLAR_ACCESS_TOKEN is not set",
        organizationSlug: null,
      };
    }
    const options = { timeoutMs: 4000, retries: { strategy: "none" as const } };
    try {
      const page = await withTimeout(4500, () =>
        polar.organizations.list({ limit: 1 }, options),
      );
      const organization = page.result.items[0];
      return {
        ok: true,
        detail: organization
          ? `Organization ${organization.slug} (${sandbox ? "sandbox" : "production"})`
          : "Token valid",
        organizationSlug: organization?.slug ?? null,
      };
    } catch (orgError) {
      try {
        await withTimeout(4500, () =>
          polar.customers.list({ limit: 1 }, options),
        );
        return {
          ok: true,
          detail: "Token valid (no organizations:read scope)",
          organizationSlug: null,
        };
      } catch {
        return {
          ok: false,
          detail: errorText(orgError),
          organizationSlug: null,
        };
      }
    }
  });
}

/** Link to the customer in the Polar dashboard (dashboard home if unknown). */
export async function getPolarCustomerUrl(customerId: string): Promise<string> {
  const { organizationSlug } = await probePolar();
  return polarCustomerUrl({ customerId, organizationSlug, sandbox });
}
