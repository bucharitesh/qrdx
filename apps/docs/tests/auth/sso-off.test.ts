// Workspace SSO (ee/, QRdx commercial licence) runs only on servers with a
// licence key (packages/auth/ee-license.ts). Without QRDX_EE_LICENSE the auth
// server must not register any of it, and the app must not offer it; with
// the key, all of it is back. The browser side is e2e/sso-off.e2e.mts.
import { afterEach, describe, expect, it, vi } from "vitest";

type Auth = {
  api: Record<string, { path?: string }>;
  handler: (request: Request) => Promise<Response>;
  options: {
    disabledPaths?: string[];
    plugins?: { id: string }[];
    rateLimit?: { customRules?: Record<string, unknown> };
  };
};

const isSsoPath = (path: string) =>
  path === "/sign-in/sso" || path.startsWith("/sso/") || path === "/sso";

/** The auth server and the app's feature switch, loaded with `license`. */
async function load(license: string | undefined) {
  vi.resetModules();
  vi.stubEnv("QRDX_EE_LICENSE", license);
  const { auth } = (await import("@repo/auth/server")) as unknown as {
    auth: Auth;
  };
  const { isFeatureAvailable, isPathAvailable } = await import(
    "@/lib/feature-availability"
  );
  const paths = Object.values(auth.api)
    .map((endpoint) => endpoint.path)
    .filter((path): path is string => typeof path === "string");
  return { auth, paths, isFeatureAvailable, isPathAvailable };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("without QRDX_EE_LICENSE", () => {
  for (const [label, value] of [
    ["unset", undefined],
    ["blank", "   "],
  ] as const) {
    it(`registers no SSO endpoint, plugin, blocked path or rate limit (${label})`, async () => {
      const { auth, paths } = await load(value);
      expect(paths.filter(isSsoPath)).toEqual([]);
      const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id);
      expect(ids).not.toContain("sso");
      expect(ids).not.toContain("qrdx-sso-gate");
      expect((auth.options.disabledPaths ?? []).filter(isSsoPath)).toEqual([]);
      expect(
        Object.keys(auth.options.rateLimit?.customRules ?? {}).filter(
          isSsoPath,
        ),
      ).toEqual([]);
    });
  }

  it("answers 404 on the SSO sign-in routes", async () => {
    const { auth } = await load(undefined);
    for (const [method, path] of [
      ["POST", "/sign-in/sso"],
      ["GET", "/sso/callback/sso-abcdefabcdef"],
      ["POST", "/sso/saml2/sp/acs/sso-abcdefabcdef"],
      ["GET", "/sso/saml2/sp/metadata?providerId=sso-abcdefabcdef"],
      ["POST", "/sso/register"],
    ] as const) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          body:
            method === "POST" ? JSON.stringify({ email: "a@b.test" }) : null,
        }),
      );
      expect(response.status, path).toBe(404);
    }
  });

  it("doesn't offer SSO in the app: feature, settings page, help page", async () => {
    const { isFeatureAvailable, isPathAvailable } = await load(undefined);
    expect(isFeatureAvailable("sso")).toBe(false);
    expect(isPathAvailable("/dashboard/acme/settings/sso")).toBe(false);
    expect(isPathAvailable("/docs/help/teams/single-sign-on")).toBe(false);
    // The rest of sign-in security doesn't need a key.
    expect(isFeatureAvailable("passkeys")).toBe(true);
  });
});

describe("with QRDX_EE_LICENSE", () => {
  it("registers the SSO plugin, its endpoints, blocked paths and rate limits", async () => {
    const { auth, paths } = await load("local-dev");
    const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(ids).toEqual(expect.arrayContaining(["sso", "qrdx-sso-gate"]));
    expect(paths).toEqual(
      expect.arrayContaining([
        "/sign-in/sso",
        "/sso/callback/:providerId",
        "/sso/saml2/sp/acs/:providerId",
        "/sso/register",
      ]),
    );
    expect(auth.options.disabledPaths).toEqual(
      expect.arrayContaining(["/sso/register", "/sso/callback"]),
    );
    expect(Object.keys(auth.options.rateLimit?.customRules ?? {})).toEqual(
      expect.arrayContaining([
        "/sign-in/sso",
        "/sso/callback/*",
        "/sso/saml2/sp/acs/*",
      ]),
    );
  });

  it("offers SSO in the app", async () => {
    const { isFeatureAvailable, isPathAvailable } = await load("local-dev");
    expect(isFeatureAvailable("sso")).toBe(true);
    expect(isPathAvailable("/dashboard/acme/settings/sso")).toBe(true);
    expect(isPathAvailable("/docs/help/teams/single-sign-on")).toBe(true);
  });
});
