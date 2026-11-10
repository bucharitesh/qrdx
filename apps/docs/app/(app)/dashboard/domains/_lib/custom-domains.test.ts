// Tests lib/custom-domains.ts against a mocked fetch and DNS resolver (no
// network). Needs dummy env values because lib/env validates on import:
//   cd apps/docs && DATABASE_URL=postgres://test@127.0.0.1:1/test \
//     VERCEL_API_TOKEN=test-token VERCEL_PROJECT_ID=prj_test VERCEL_TEAM_ID=team_test \
//     npx tsx --conditions=react-server --test app/dashboard/domains/_lib/custom-domains.test.ts
import assert from "node:assert/strict";
import { Resolver } from "node:dns/promises";
import { before, beforeEach, describe, it } from "node:test";

type TxtAnswer = string[][] | NodeJS.ErrnoException;
let txtAnswers: Record<string, TxtAnswer> = {};
Resolver.prototype.resolveTxt = async function resolveTxt(name: string) {
  const answer = txtAnswers[name];
  if (!answer) {
    throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  }
  if (answer instanceof Error) throw answer;
  return answer;
};

interface Call {
  method: string;
  url: URL;
  body: unknown;
  authorization: string | null;
}
let calls: Call[] = [];
let routes: Record<string, () => Response> = {};

globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  calls.push({
    method,
    url,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    authorization: new Headers(init?.headers).get("authorization"),
  });
  const route = routes[`${method} ${url.pathname}`];
  if (!route) throw new Error(`Unexpected request ${method} ${url.pathname}`);
  return route();
}) as typeof fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Imported after the mocks are in place (the module creates its resolver on load).
let lib: typeof import("@/lib/custom-domains");
before(async () => {
  lib = await import("@/lib/custom-domains");
});

beforeEach(() => {
  txtAnswers = {};
  calls = [];
  routes = {};
});

describe("manual verification", () => {
  const token = "abc123";
  const name = "_qrdx-challenge.go.brand.com";

  it("asks for a TXT record and a routing record", () => {
    const [txt, cname] = lib.manualRecords("go.brand.com", token);
    assert.deepEqual(
      { type: txt?.type, name: txt?.name, value: txt?.value },
      { type: "TXT", name, value: "qrdx-verify=abc123" },
    );
    assert.equal(cname?.type, "CNAME");
    assert.equal(cname?.name, "go.brand.com");
  });

  it("verifies when the TXT value matches (chunks joined)", async () => {
    txtAnswers[name] = [["other"], ["qrdx-verify=", "abc123"]];
    const check = await lib.checkManualDomain("go.brand.com", token);
    assert.equal(check.verified, true);
    assert.equal(check.message, null);
  });

  it("explains a missing record", async () => {
    const check = await lib.checkManualDomain("go.brand.com", token);
    assert.equal(check.verified, false);
    assert.match(check.message ?? "", /No TXT record/);
  });

  it("explains a wrong value", async () => {
    txtAnswers[name] = [["qrdx-verify=nope"]];
    const check = await lib.checkManualDomain("go.brand.com", token);
    assert.equal(check.verified, false);
    assert.match(check.message ?? "", /doesn't match/);
  });

  it("treats resolver failures as try-again, not as missing", async () => {
    txtAnswers[name] = Object.assign(new Error("timeout"), {
      code: "ETIMEOUT",
    });
    const check = await lib.checkManualDomain("go.brand.com", token);
    assert.equal(check.verified, false);
    assert.match(check.message ?? "", /try again/);
  });
});

describe("Vercel Domains API client", () => {
  it("is the active mode when a token and project id are set", () => {
    assert.equal(lib.getCustomDomainMode(), "vercel");
  });

  it("checks an existing, configured subdomain", async () => {
    routes["GET /v9/projects/prj_test/domains/go.brand.com"] = () =>
      json({ name: "go.brand.com", apexName: "brand.com", verified: true });
    routes["GET /v6/domains/go.brand.com/config"] = () =>
      json({
        configuredBy: "CNAME",
        misconfigured: false,
        acceptedChallenges: [],
        recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }],
        recommendedCNAME: [
          { rank: 2, value: "cname.vercel-dns.com." },
          { rank: 1, value: "abc.vercel-dns-017.com." },
        ],
      });

    const check = await lib.checkVercelDomain("go.brand.com");
    assert.equal(check.verified, true);
    assert.equal(check.message, null);
    assert.equal(check.apexName, "brand.com");
    assert.deepEqual(check.records, [
      { type: "CNAME", name: "go.brand.com", value: "abc.vercel-dns-017.com" },
    ]);

    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.url.pathname}`),
      [
        "GET /v9/projects/prj_test/domains/go.brand.com",
        "GET /v6/domains/go.brand.com/config",
      ],
    );
    for (const call of calls) {
      assert.equal(call.url.searchParams.get("teamId"), "team_test");
      assert.equal(call.authorization, "Bearer test-token");
    }
    assert.equal(calls[1]?.url.searchParams.get("projectIdOrName"), "prj_test");
  });

  it("adds a missing apex domain and reports the TXT challenge", async () => {
    const challenge = {
      type: "TXT",
      domain: "_vercel.brand.com",
      value: "vc-domain-verify=brand.com,123",
      reason: "pending_domain_verification",
    };
    routes["GET /v9/projects/prj_test/domains/brand.com"] = () =>
      json({ error: { code: "not_found", message: "Not found" } }, 404);
    routes["POST /v10/projects/prj_test/domains"] = () =>
      json({
        name: "brand.com",
        apexName: "brand.com",
        verified: false,
        verification: [challenge],
      });
    routes["POST /v9/projects/prj_test/domains/brand.com/verify"] = () =>
      json(
        { error: { code: "missing_txt_record", message: "No TXT record" } },
        400,
      );
    routes["GET /v6/domains/brand.com/config"] = () =>
      json({
        configuredBy: null,
        misconfigured: true,
        acceptedChallenges: [],
        recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }],
        recommendedCNAME: [],
      });

    const check = await lib.checkVercelDomain("brand.com");
    assert.equal(check.verified, false);
    assert.match(check.message ?? "", /TXT record/);
    assert.deepEqual(
      check.records.map(({ type, name, value }) => ({ type, name, value })),
      [
        { type: "A", name: "brand.com", value: "76.76.21.21" },
        {
          type: "TXT",
          name: "_vercel.brand.com",
          value: "vc-domain-verify=brand.com,123",
        },
      ],
    );
    const add = calls.find((call) => call.method === "POST");
    assert.deepEqual(add?.body, { name: "brand.com" });
  });

  it("is not verified while DNS doesn't point at Vercel", async () => {
    routes["GET /v9/projects/prj_test/domains/go.brand.com"] = () =>
      json({ name: "go.brand.com", apexName: "brand.com", verified: true });
    routes["GET /v6/domains/go.brand.com/config"] = () =>
      json({
        configuredBy: null,
        misconfigured: true,
        acceptedChallenges: [],
        recommendedIPv4: [],
        recommendedCNAME: [],
      });

    const check = await lib.checkVercelDomain("go.brand.com");
    assert.equal(check.verified, false);
    assert.match(check.message ?? "", /doesn't point/);
    assert.deepEqual(check.records[0], {
      type: "CNAME",
      name: "go.brand.com",
      value: "cname.vercel-dns.com",
    });
  });

  it("surfaces non-404 errors as VercelApiError", async () => {
    routes["GET /v9/projects/prj_test/domains/go.brand.com"] = () =>
      json({ error: { code: "forbidden", message: "Not authorized" } }, 403);
    await assert.rejects(
      lib.checkVercelDomain("go.brand.com"),
      (error: unknown) =>
        error instanceof lib.VercelApiError &&
        error.status === 403 &&
        error.code === "forbidden",
    );
  });

  it("treats removing an already-removed domain as done", async () => {
    routes["DELETE /v9/projects/prj_test/domains/go.brand.com"] = () =>
      json({ error: { code: "not_found", message: "Not found" } }, 404);
    await lib.removeVercelProjectDomain("go.brand.com");

    routes["DELETE /v9/projects/prj_test/domains/go.brand.com"] = () =>
      new Response("oops", { status: 500 });
    await assert.rejects(
      lib.removeVercelProjectDomain("go.brand.com"),
      (error: unknown) =>
        error instanceof lib.VercelApiError && error.status === 500,
    );
  });
});
