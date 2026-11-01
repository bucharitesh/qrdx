// Where /settings/portal sends the browser for every Polar outcome. The Polar
// client is a fake: nothing here reaches Polar or a database.
import { describe, expect, it, vi } from "vitest";
import {
  NO_CUSTOMER_PATH,
  PORTAL_UNAVAILABLE_PATH,
  type PortalClient,
  type PortalFailure,
  resolvePortalRedirect,
  SIGNED_OUT_PATH,
} from "@/app/settings/portal/_lib/portal";

const PORTAL_URL = "https://polar.sh/qrdx/portal?customer_session_token=abc";
const RETURN_URL = "http://localhost:3000/settings/usage";

/** An error shaped like the Polar SDK's (PolarError subclasses). */
function polarError(name: string, statusCode: number, extra = {}) {
  return Object.assign(new Error(`${name}: Status ${statusCode}`), {
    name,
    statusCode,
    ...extra,
  });
}

function fakeClient(overrides: {
  getExternal?: PortalClient["customers"]["getExternal"];
  create?: PortalClient["customerSessions"]["create"];
}): PortalClient {
  return {
    customers: {
      getExternal:
        overrides.getExternal ?? vi.fn(async () => ({ id: "cus_123" })),
    },
    customerSessions: {
      create:
        overrides.create ??
        vi.fn(async () => ({ customerPortalUrl: PORTAL_URL })),
    },
  };
}

const signedIn = async () => "user_1";

describe("resolvePortalRedirect", () => {
  it("opens the portal for a customer, returning to the usage page", async () => {
    const create = vi.fn(async () => ({ customerPortalUrl: PORTAL_URL }));
    const getExternal = vi.fn(async () => ({ id: "cus_123" }));
    const onFailure = vi.fn();

    const url = await resolvePortalRedirect({
      client: fakeClient({ getExternal, create }),
      getUserId: signedIn,
      returnUrl: RETURN_URL,
      onFailure,
    });

    expect(url).toBe(PORTAL_URL);
    expect(getExternal).toHaveBeenCalledWith({ externalId: "user_1" });
    expect(create).toHaveBeenCalledWith({
      customerId: "cus_123",
      returnUrl: RETURN_URL,
    });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors to sign in", async () => {
    const getExternal = vi.fn();
    const url = await resolvePortalRedirect({
      client: fakeClient({ getExternal }),
      getUserId: async () => {
        throw new Error("Unauthorized");
      },
    });
    expect(url).toBe(SIGNED_OUT_PATH);
    expect(getExternal).not.toHaveBeenCalled();
  });

  it("sends users without a Polar customer to pricing", async () => {
    const onFailure = vi.fn();
    const url = await resolvePortalRedirect({
      client: fakeClient({
        getExternal: async () => {
          throw polarError("ResourceNotFound", 404);
        },
      }),
      getUserId: signedIn,
      onFailure,
    });
    expect(url).toBe(NO_CUSTOMER_PATH);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("shows the unavailable notice when billing isn't configured", async () => {
    const onFailure = vi.fn();
    const url = await resolvePortalRedirect({
      client: null,
      getUserId: signedIn,
      onFailure,
    });
    expect(url).toBe(PORTAL_UNAVAILABLE_PATH);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "config" }),
    );
  });

  it("shows the unavailable notice when Polar rejects the token", async () => {
    const failures: PortalFailure[] = [];
    const url = await resolvePortalRedirect({
      client: fakeClient({
        getExternal: async () => {
          // Polar errors carry the request, Authorization header included.
          throw polarError("SDKError", 401, {
            data$: {
              request$: { headers: { authorization: "Bearer polar_oat_x" } },
            },
          });
        },
      }),
      getUserId: signedIn,
      onFailure: (failure) => failures.push(failure),
    });

    expect(url).toBe(PORTAL_UNAVAILABLE_PATH);
    expect(failures).toEqual([
      { stage: "customer", error: "SDKError", status: 401 },
    ]);
    expect(JSON.stringify(failures)).not.toContain("polar_oat_x");
  });

  it("shows the unavailable notice when the session can't be created", async () => {
    const onFailure = vi.fn();
    const url = await resolvePortalRedirect({
      client: fakeClient({
        create: async () => {
          throw polarError("SDKError", 500);
        },
      }),
      getUserId: signedIn,
      onFailure,
    });
    expect(url).toBe(PORTAL_UNAVAILABLE_PATH);
    expect(onFailure).toHaveBeenCalledWith({
      stage: "session",
      error: "SDKError",
      status: 500,
    });
  });

  it("shows the unavailable notice on network errors", async () => {
    const onFailure = vi.fn();
    const url = await resolvePortalRedirect({
      client: fakeClient({
        getExternal: async () => {
          throw new TypeError("fetch failed");
        },
      }),
      getUserId: signedIn,
      onFailure,
    });
    expect(url).toBe(PORTAL_UNAVAILABLE_PATH);
    expect(onFailure).toHaveBeenCalledWith({
      stage: "customer",
      error: "TypeError",
      status: undefined,
    });
  });

  it("shows the unavailable notice when Polar returns no portal URL", async () => {
    const url = await resolvePortalRedirect({
      client: fakeClient({
        create: async () => ({ customerPortalUrl: "" }),
      }),
      getUserId: signedIn,
    });
    expect(url).toBe(PORTAL_UNAVAILABLE_PATH);
  });
});
