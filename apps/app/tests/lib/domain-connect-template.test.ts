// QRdx's Domain Connect template (domain-connect/qrdx.dev.qrdx.json), how
// the app maps its DNS records onto it, the offers on the Domains page, the
// return from the DNS provider and the feature switch. No network: DNS and
// HTTP are fakes, the signing key is generated here.
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeFeatures,
  type FeatureContext,
  missingFeatureSetup,
} from "@repo/availability";
import { describe, expect, it, vi } from "vitest";
import {
  createVerificationToken,
  type DnsRecord,
  manualRecords,
} from "@/lib/custom-domains";
import type { DnsLookups, GetJson } from "@/lib/domain-connect/discovery";
import {
  createOfferService,
  type OfferCandidate,
} from "@/lib/domain-connect/offers";
import {
  connectRedirectUri,
  parseConnectReturn,
} from "@/lib/domain-connect/return";
import {
  parseSigningKey,
  publicKeyTxtValues,
  verifyQuery,
} from "@/lib/domain-connect/signing";
import {
  SIGNING_KEY_ID,
  TEMPLATE_GROUPS,
  templateApplyFor,
} from "@/lib/domain-connect/template";
import { applyTemplate, type Template } from "../support/domain-connect-apply";

const TEMPLATE_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "domain-connect",
  "qrdx.dev.qrdx.json",
);
const template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8")) as Template;

const vercelRecords = (target = "cname.vercel-dns.com"): DnsRecord[] => [
  { type: "CNAME", name: "go.brand.com", value: target },
];
const vercelChallenge: DnsRecord = {
  type: "TXT",
  name: "_vercel.brand.com",
  value: "vc-domain-verify=go.brand.com,3e8e1d1a9b5c",
  note: "Proves you own the domain.",
};

/**
 * Self-hosted records from lib/custom-domains.ts. Tests run with the app at
 * localhost, which no public DNS record can point to, so the CNAME target is
 * swapped for a real-looking server name.
 */
function selfHostedRecords(hostname: string, token: string): DnsRecord[] {
  return manualRecords(hostname, token).map((record) =>
    record.type === "CNAME" ? { ...record, value: "qr.example.org" } : record,
  );
}

const comparable = (records: { type: string; name: string; value: string }[]) =>
  records.map(({ type, name, value }) => `${type} ${name} ${value}`).sort();

/** What the DNS provider writes when the app's apply request is followed. */
function applied(records: DnsRecord[], hostname: string, zone: string) {
  const apply = templateApplyFor(records, hostname, zone);
  if (!apply) throw new Error("no template apply");
  return applyTemplate(template, {
    domain: zone,
    host: hostname.slice(0, -(zone.length + 1)),
    groupIds: apply.groupIds,
    variables: apply.variables,
  });
}

describe("the template file", () => {
  it("is named and keyed the way the app expects", () => {
    expect(
      TEMPLATE_PATH.endsWith(
        `${template.providerId}.${template.serviceId}.json`,
      ),
    ).toBe(true);
    expect(template.providerId).toBe("qrdx.dev");
    expect(template.serviceId).toBe("qrdx");
    // The app checks its public key at _dck1.<providerId>.
    expect(template.syncPubKeyDomain).toBe(template.providerId);
    expect(template.hostRequired).toBe(true);
    expect(
      [...new Set(template.records.map((record) => record.groupId))].sort(),
    ).toEqual([...TEMPLATE_GROUPS].sort());
  });

  it("writes exactly the Vercel records the Domains page shows", () => {
    for (const records of [
      vercelRecords(),
      vercelRecords("d1d4fc829fe7bc7c.vercel-dns-017.com"),
      [...vercelRecords(), vercelChallenge],
    ]) {
      expect(comparable(applied(records, "go.brand.com", "brand.com"))).toEqual(
        comparable(records),
      );
    }
  });

  it("writes exactly the self-hosted records, for nested subdomains too", () => {
    for (const hostname of ["go.brand.com", "qr.eu.brand.com"]) {
      const records = selfHostedRecords(hostname, createVerificationToken());
      expect(comparable(applied(records, hostname, "brand.com"))).toEqual(
        comparable(records),
      );
    }
  });
});

describe("mapping records onto the template", () => {
  it("sends only the groups the records need", () => {
    expect(
      templateApplyFor(vercelRecords(), "go.brand.com", "brand.com"),
    ).toEqual({
      groupIds: ["route"],
      variables: { target: "cname.vercel-dns.com" },
    });
    expect(
      templateApplyFor(
        [vercelChallenge, ...vercelRecords()],
        "go.brand.com",
        "brand.com",
      ),
    ).toEqual({
      groupIds: ["route", "vercel"],
      variables: {
        target: "cname.vercel-dns.com",
        vercel: "go.brand.com,3e8e1d1a9b5c",
      },
    });
    const token = createVerificationToken();
    expect(
      templateApplyFor(
        selfHostedRecords("go.brand.com", token),
        "go.brand.com",
        "brand.com",
      ),
    ).toEqual({
      groupIds: ["route", "qrdx"],
      variables: { target: "qr.example.org", token },
    });
  });

  it("refuses what the template can't write exactly", () => {
    const cases: [string, DnsRecord[], string, string][] = [
      [
        "apex A record",
        [{ type: "A", name: "brand.com", value: "76.76.21.21" }],
        "brand.com",
        "brand.com",
      ],
      [
        "delegated subzone (apex)",
        vercelRecords(),
        "go.brand.com",
        "go.brand.com",
      ],
      ["no records yet", [], "go.brand.com", "brand.com"],
      ["TXT only", [vercelChallenge], "go.brand.com", "brand.com"],
      [
        "unknown TXT",
        [
          ...vercelRecords(),
          { type: "TXT", name: "go.brand.com", value: "something" },
        ],
        "go.brand.com",
        "brand.com",
      ],
      [
        "Vercel TXT for another host",
        [
          ...vercelRecords(),
          { ...vercelChallenge, value: "vc-domain-verify=qr.brand.com,abc" },
        ],
        "go.brand.com",
        "brand.com",
      ],
      [
        "Vercel TXT outside the zone",
        [
          ...vercelRecords(),
          { ...vercelChallenge, name: "_vercel.go.brand.com" },
        ],
        "go.brand.com",
        "brand.com",
      ],
      [
        "two CNAMEs",
        [...vercelRecords(), ...vercelRecords("other.vercel-dns.com")],
        "go.brand.com",
        "brand.com",
      ],
      [
        "CNAME to localhost",
        manualRecords("go.brand.com", createVerificationToken()),
        "go.brand.com",
        "brand.com",
      ],
    ];
    for (const [label, records, hostname, zone] of cases) {
      expect(templateApplyFor(records, hostname, zone), label).toBeNull();
    }
  });
});

// ─── Offers ─────────────────────────────────────────────────────────────────

const key =
  parseSigningKey(
    generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  ) ?? expect.unreachable();
const config = { providerId: "qrdx.dev", serviceId: "qrdx", key };

const SETTINGS_URL =
  "https://api.cloudflare.com/client/v4/dns/domainconnect/v2/brand.com/settings";
const TEMPLATE_URL =
  "https://api.cloudflare.com/client/v4/dns/domainconnect/v2/domainTemplates/providers/qrdx.dev/services/qrdx";
const SETTINGS = {
  providerId: "cloudflare.com",
  providerName: "cloudflare",
  providerDisplayName: "Cloudflare",
  urlSyncUX: "https://dash.cloudflare.com/domainconnect",
  urlAPI: "https://api.cloudflare.com/client/v4/dns/domainconnect",
};

const notFound = (code = "ENOTFOUND") =>
  Object.assign(new Error(code), { code });

function world({
  publishedKey = key.publicKey as string | null,
  templateStatus = 200,
  settings = SETTINGS as unknown,
  hangHttp = false,
} = {}) {
  const requests: string[] = [];
  const dns: DnsLookups = {
    resolveCname: async () => {
      throw notFound("ENODATA");
    },
    resolveSoa: async (name) => {
      if (name === "brand.com") return {};
      throw notFound("ENODATA");
    },
    resolveTxt: async (name) => {
      if (name === "_domainconnect.brand.com") {
        return [["api.cloudflare.com/client/v4/dns/domainconnect"]];
      }
      if (name === `${SIGNING_KEY_ID}.qrdx.dev` && publishedKey) {
        return publicKeyTxtValues(publishedKey).map((value) => [value]);
      }
      throw notFound();
    },
  };
  const getJson: GetJson = (url) => {
    requests.push(url.toString());
    if (hangHttp) return new Promise(() => undefined);
    if (url.toString() === SETTINGS_URL) {
      return Promise.resolve({ status: 200, body: settings });
    }
    if (url.toString() === TEMPLATE_URL) {
      return Promise.resolve({ status: templateStatus, body: null });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const log = vi.fn();
  const service = createOfferService(config, {
    dns,
    getJson,
    appUrl: new URL("https://qrdx.dev"),
    log,
    budgetMs: 200,
  });
  return { service, requests, log };
}

const candidate = (
  records = [...vercelRecords(), vercelChallenge],
): OfferCandidate => ({ id: "dom1", hostname: "go.brand.com", records });

describe("offers on the Domains page", () => {
  it("offers a signed Cloudflare link for a subdomain waiting for DNS", async () => {
    const { service, log } = world();
    const offers = await service.offers([candidate()]);
    const offer = offers.dom1 ?? expect.unreachable();
    expect(offer.providerName).toBe("Cloudflare");
    const url = new URL(offer.url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://dash.cloudflare.com/domainconnect/v2/domainTemplates/providers/qrdx.dev/services/qrdx/apply",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      domain: "brand.com",
      host: "go",
      groupId: "route,vercel",
      target: "cname.vercel-dns.com",
      vercel: "go.brand.com,3e8e1d1a9b5c",
      redirect_uri: connectRedirectUri(new URL("https://qrdx.dev"), "dom1"),
      key: SIGNING_KEY_ID,
    });
    const [, signed = "", sig = ""] =
      offer.url.split("?", 2)[1]?.match(/^(.*)&key=[^&]+&sig=([^&]+)$/) ?? [];
    expect(verifyQuery(signed, decodeURIComponent(sig), key.publicKey)).toBe(
      true,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("caches discovery between page views", async () => {
    const { service, requests } = world();
    await service.offers([candidate()]);
    const first = requests.length;
    await service.offers([candidate()]);
    expect(requests.length).toBe(first);
  });

  it("shows nothing, loudly, when the published key is missing or wrong", async () => {
    const missing = world({ publishedKey: null });
    expect(await missing.service.offers([candidate()])).toEqual({});
    expect(String(missing.log.mock.calls[0]?.[0])).toMatch(
      /No Domain Connect public key at _dck1\.qrdx\.dev/,
    );
    expect(missing.requests).toEqual([]);

    const other = parseSigningKey(
      generateKeyPairSync("rsa", { modulusLength: 2048 })
        .privateKey.export({ type: "pkcs8", format: "pem" })
        .toString(),
    );
    const wrong = world({ publishedKey: other?.publicKey ?? null });
    expect(await wrong.service.offers([candidate()])).toEqual({});
    expect(String(wrong.log.mock.calls[0]?.[0])).toMatch(/doesn't match/);
  });

  it("shows nothing when the provider hasn't enabled the template", async () => {
    const { service, log } = world({ templateStatus: 404 });
    expect(await service.offers([candidate()])).toEqual({});
    expect(log).not.toHaveBeenCalled();
  });

  it("shows nothing for records the template can't write, or a slow provider", async () => {
    const apex = world();
    expect(
      await apex.service.offers([
        {
          id: "dom2",
          hostname: "brand.com",
          records: [{ type: "A", name: "brand.com", value: "76.76.21.21" }],
        },
      ]),
    ).toEqual({});
    const slow = world({ hangHttp: true });
    expect(await slow.service.offers([candidate()])).toEqual({});
  });

  it("uses a neutral label when the provider sends no usable name", async () => {
    const { service } = world({
      settings: {
        ...SETTINGS,
        providerDisplayName: "x".repeat(60),
        providerName: "y".repeat(60),
      },
    });
    expect((await service.offers([candidate()])).dom1?.providerName).toBeNull();
  });
});

describe("coming back from the DNS provider", () => {
  it("builds the return link and reads it back", () => {
    expect(connectRedirectUri(new URL("https://qrdx.dev"), "ck9abc")).toBe(
      "https://qrdx.dev/dashboard?to=settings/domains&connected=ck9abc",
    );
    expect(parseConnectReturn({ connected: "ck9abc" })).toEqual({
      domainId: "ck9abc",
      applied: true,
    });
    expect(
      parseConnectReturn({ connected: ["ck9abc", "other"] })?.domainId,
    ).toBe("ck9abc");
  });

  it("notices errors, also when the provider appended them with a second ?", () => {
    expect(
      parseConnectReturn({ connected: "ck9abc", error: "access_denied" }),
    ).toEqual({ domainId: "ck9abc", applied: false });
    expect(
      parseConnectReturn({
        connected: "ck9abc?error=access_denied&error_description=user_cancel",
      }),
    ).toEqual({ domainId: "ck9abc", applied: false });
  });

  it("ignores anything that isn't a domain id", () => {
    expect(parseConnectReturn({})).toBeNull();
    expect(parseConnectReturn({ connected: "" })).toBeNull();
    expect(parseConnectReturn({ connected: "../settings" })).toBeNull();
  });
});

describe("the domainConnect feature", () => {
  const ctx = (
    env: Record<string, string>,
    onVercel: boolean,
  ): FeatureContext => ({ env, onVercel, production: true });
  const ids = {
    DOMAIN_CONNECT_PROVIDER_ID: "qrdx.dev",
    DOMAIN_CONNECT_SERVICE_ID: "qrdx",
    DOMAIN_CONNECT_PRIVATE_KEY: "set",
  };

  it("needs custom domains to work first", () => {
    expect(computeFeatures(ctx(ids, true)).domainConnect).toBe(false);
    expect(missingFeatureSetup("domainConnect", ctx(ids, true))).toEqual([
      "VERCEL_API_TOKEN",
      "VERCEL_PROJECT_ID",
    ]);
    const vercel = {
      ...ids,
      VERCEL_API_TOKEN: "set",
      VERCEL_PROJECT_ID: "set",
    };
    expect(computeFeatures(ctx(vercel, true)).domainConnect).toBe(true);
  });

  it("works self-hosted with just its own three variables", () => {
    expect(computeFeatures(ctx(ids, false)).domainConnect).toBe(true);
    const { DOMAIN_CONNECT_PRIVATE_KEY: _, ...noKey } = ids;
    expect(missingFeatureSetup("domainConnect", ctx(noKey, false))).toEqual([
      "DOMAIN_CONNECT_PRIVATE_KEY",
    ]);
  });
});
