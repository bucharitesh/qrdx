// Search Console on /admin/growth signs a service-account JWT with
// node:crypto (RS256), trades it at Google's token endpoint for a read-only
// token and queries Search Analytics. The key comes from
// GSC_SERVICE_ACCOUNT_JSON and must never leave the server except as a
// signature. A key is generated here; fetch is faked, nothing goes out.

import {
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  verify,
} from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {} as { GSC_SERVICE_ACCOUNT_JSON?: string },
}));
vi.mock("@/lib/env", () => ({ env: state.env }));

const gsc = await import("@/app/(app)/admin/_lib/search-console");
const { growthWeeks } = await import("@/app/(app)/admin/_lib/weeks");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const KEY_FILE = {
  type: "service_account",
  project_id: "qrdx-test",
  private_key_id: "key-1",
  private_key: PEM,
  client_email: "growth@qrdx-test.iam.gserviceaccount.com",
  token_uri: "https://evil.example/token",
};

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

function verifyJwt(jwt: string, key: KeyObject = publicKey) {
  const [header, claims, signature] = jwt.split(".");
  return verify(
    "sha256",
    Buffer.from(`${header}.${claims}`),
    key,
    Buffer.from(signature ?? "", "base64url"),
  );
}

describe("parseServiceAccount", () => {
  it("reads a Google JSON key", () => {
    const account = gsc.parseServiceAccount(JSON.stringify(KEY_FILE));
    expect(account?.clientEmail).toBe(KEY_FILE.client_email);
    expect(account?.keyId).toBe("key-1");
    expect(account?.privateKey.asymmetricKeyType).toBe("rsa");
  });

  it("accepts a key whose newlines were written out as \\n", () => {
    const flattened = JSON.stringify(KEY_FILE).replace(/\\n/g, "\\\\n");
    const pem = (JSON.parse(flattened) as { private_key: string }).private_key;
    expect(pem).not.toContain("\n");
    expect(pem).toContain("\\n-----END");
    expect(gsc.parseServiceAccount(flattened)?.clientEmail).toBe(
      KEY_FILE.client_email,
    );
  });

  it.each([
    ["not JSON", "{nope"],
    ["not an object", '"text"'],
    ["no email", JSON.stringify({ ...KEY_FILE, client_email: undefined })],
    ["no key", JSON.stringify({ ...KEY_FILE, private_key: undefined })],
    [
      "a broken key",
      JSON.stringify({ ...KEY_FILE, private_key: "-----BEGIN" }),
    ],
    [
      "an EC key",
      JSON.stringify({
        ...KEY_FILE,
        private_key: generateKeyPairSync("ec", { namedCurve: "P-256" })
          .privateKey.export({ type: "pkcs8", format: "pem" })
          .toString(),
      }),
    ],
  ])("refuses %s", (_, json) => {
    expect(gsc.parseServiceAccount(json)).toBeNull();
  });
});

describe("signServiceAccountJwt", () => {
  const account = gsc.parseServiceAccount(JSON.stringify(KEY_FILE));
  if (!account) throw new Error("test key didn't parse");

  it("is an RS256 JWT that verifies with the service account's public key", () => {
    const jwt = gsc.signServiceAccountJwt(account, {
      now: new Date("2026-11-13T12:00:00Z"),
    });
    const [header, claims] = jwt.split(".");
    expect(decode(header ?? "")).toEqual({
      alg: "RS256",
      typ: "JWT",
      kid: "key-1",
    });
    expect(decode(claims ?? "")).toEqual({
      iss: KEY_FILE.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_794_571_200,
      exp: 1_794_574_800,
    });
    expect(verifyJwt(jwt)).toBe(true);
    // The exported public key in another form verifies it too.
    expect(
      verifyJwt(
        jwt,
        createPublicKey(publicKey.export({ type: "spki", format: "pem" })),
      ),
    ).toBe(true);
  });

  it("doesn't verify once a claim is changed", () => {
    const jwt = gsc.signServiceAccountJwt(account);
    const [header, , signature] = jwt.split(".");
    const forged = Buffer.from(
      JSON.stringify({ iss: "someone@else", scope: "all" }),
    ).toString("base64url");
    expect(verifyJwt(`${header}.${forged}.${signature}`)).toBe(false);
  });

  it("never carries the private key", () => {
    const jwt = gsc.signServiceAccountJwt(account);
    const body = PEM.split("\n")[1] ?? "";
    expect(jwt).not.toContain(body.slice(0, 20));
    expect(
      Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString(),
    ).not.toMatch(/PRIVATE KEY/);
  });
});

describe("weeklySearch and topSearch", () => {
  const weeks = ["2026-11-02", "2026-11-09"];
  const row = (key: string, clicks: number, impressions: number) => ({
    keys: [key],
    clicks,
    impressions,
  });

  it("sums days into Monday weeks and counts the days with data", () => {
    expect(
      gsc.weeklySearch(weeks, [
        row("2026-11-01", 5, 50), // the week before: left out
        row("2026-11-02", 1, 10),
        row("2026-11-08", 2, 20),
        row("2026-11-10", 0, 7),
      ]),
    ).toEqual([
      { week: "2026-11-02", clicks: 3, impressions: 30, days: 2 },
      { week: "2026-11-09", clicks: 0, impressions: 7, days: 1 },
    ]);
  });

  it("ranks by clicks, then impressions, and keeps 10", () => {
    const rows = [
      row("/b", 0, 116),
      row("/", 6, 218),
      row("/a", 0, 116),
      ...Array.from({ length: 12 }, (_, i) => row(`/x${i}`, 0, 1)),
    ];
    const top = gsc.topSearch(rows);
    expect(top).toHaveLength(10);
    expect(top.slice(0, 3).map((entry) => entry.key)).toEqual([
      "/",
      "/a",
      "/b",
    ]);
  });

  it("drops malformed rows", () => {
    expect(
      gsc.parseRows([
        row("/", 1, 2),
        { keys: "/", clicks: 1, impressions: 2 },
        { keys: ["/"], clicks: "1", impressions: 2 },
        null,
      ]),
    ).toEqual([row("/", 1, 2)]);
    expect(gsc.parseRows(undefined)).toEqual([]);
  });
});

describe("getSearchConsole", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    state.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify(KEY_FILE);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    state.env.GSC_SERVICE_ACCOUNT_JSON = undefined;
  });

  it("explains the setup when the variable isn't set", async () => {
    state.env.GSC_SERVICE_ACCOUNT_JSON = undefined;
    const weeks = growthWeeks(new Date("2026-01-05T00:00:00Z"));
    expect(await gsc.getSearchConsole(weeks)).toEqual({
      status: "unconfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when the variable isn't a usable key, without calling Google", async () => {
    state.env.GSC_SERVICE_ACCOUNT_JSON = '{"client_email":"a@b"}';
    const weeks = growthWeeks(new Date("2026-01-12T00:00:00Z"));
    expect(await gsc.getSearchConsole(weeks)).toEqual({ status: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs in at Google's token endpoint only, then reads the property", async () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const weeks = growthWeeks(now);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return json({ access_token: "ya29.test", expires_in: 3599 });
      }
      const body = JSON.parse(String(init?.body)) as {
        dimensions: string[];
      };
      if (body.dimensions[0] === "date") {
        return json({
          rows: [
            { keys: ["2026-11-03"], clicks: 1, impressions: 20 },
            { keys: ["2026-11-10"], clicks: 0, impressions: 9 },
          ],
        });
      }
      return json({
        rows: [
          { keys: [`top-${body.dimensions[0]}`], clicks: 1, impressions: 5 },
        ],
      });
    });

    const result = await gsc.getSearchConsole(weeks, now);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.lastDay).toBe("2026-11-10");
    expect(result.weekly.at(-1)).toEqual({
      week: "2026-11-09",
      clicks: 0,
      impressions: 9,
      days: 1,
    });
    // 28 days ending on the last day with data.
    expect(result.top).toMatchObject({ from: "2026-10-14", to: "2026-11-10" });
    expect(result.top.pages[0]?.key).toBe("top-page");
    expect(result.top.queries[0]?.key).toBe("top-query");

    const [token, ...queries] = fetchMock.mock.calls;
    // The key file's token_uri is ignored: the signed JWT only goes to Google.
    expect(String(token?.[0])).toBe("https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(String(token?.[1]?.body));
    expect(form.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(verifyJwt(form.get("assertion") ?? "")).toBe(true);

    expect(queries).toHaveLength(3);
    for (const [url, init] of queries) {
      expect(String(url)).toBe(
        "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aqrdx.dev/searchAnalytics/query",
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer ya29.test",
      );
    }
    expect(JSON.parse(String(queries[0]?.[1]?.body))).toMatchObject({
      startDate: weeks[0],
      endDate: "2026-11-13",
      dimensions: ["date"],
    });

    // Nothing sent anywhere holds the private key.
    const sent = fetchMock.mock.calls
      .map(([, init]) => String(init?.body))
      .join("\n");
    expect(sent).not.toContain("PRIVATE KEY");
    expect(sent).not.toContain((PEM.split("\n")[1] ?? "").slice(0, 20));
  });

  it("reports Google's reason on a refusal, and nothing secret", async () => {
    const now = new Date("2026-10-07T12:00:00Z");
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("oauth2")
        ? json({ access_token: "ya29.secret-token" })
        : json(
            {
              error: {
                code: 403,
                message:
                  "User does not have sufficient permission for site 'sc-domain:qrdx.dev'.",
              },
            },
            403,
          ),
    );
    const result = await gsc.getSearchConsole(growthWeeks(now), now);
    expect(result).toEqual({
      status: "error",
      message:
        "Search Console query failed (HTTP 403: User does not have sufficient permission for site 'sc-domain:qrdx.dev'.)",
    });
    expect(JSON.stringify(result)).not.toContain("ya29");
  });

  it("reports a refused sign-in", async () => {
    const now = new Date("2026-09-30T12:00:00Z");
    fetchMock.mockResolvedValue(
      json(
        { error: "invalid_grant", error_description: "Invalid JWT Signature." },
        400,
      ),
    );
    expect(await gsc.getSearchConsole(growthWeeks(now), now)).toEqual({
      status: "error",
      message:
        "Google sign-in failed (HTTP 400: invalid_grant: Invalid JWT Signature.)",
    });
  });
});
