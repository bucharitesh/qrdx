// Domain Connect discovery (lib/domain-connect/discovery.ts) against a fake
// DNS and fake HTTP: zone and host splitting, the _domainconnect TXT record,
// the settings JSON and the template check. No network.
import { describe, expect, it } from "vitest";
import {
  DiscoveryUnavailableError,
  type DnsLookups,
  discoverDnsProvider,
  findZone,
  type GetJson,
  hostInZone,
  isTemplateSupported,
  parseDiscoveryRecord,
  parseSettings,
} from "@/lib/domain-connect/discovery";

const dnsError = (code: string) =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;

interface FakeZone {
  /** Names with an SOA record (zone apexes) */
  soa?: string[];
  /** name → CNAME target */
  cname?: Record<string, string>;
  txt?: Record<string, string[][]>;
  /** name → error code for every lookup of that name */
  fail?: Record<string, string>;
}

/**
 * A resolver over fixed records. Like a real one, an SOA query on a name with
 * a CNAME answers with the target's SOA.
 */
function fakeDns({ soa = [], cname = {}, txt = {}, fail = {} }: FakeZone) {
  const queries: string[] = [];
  const lookups: DnsLookups = {
    resolveCname: async (name) => {
      queries.push(`CNAME ${name}`);
      if (fail[name]) throw dnsError(fail[name]);
      if (cname[name]) return [cname[name]];
      throw dnsError("ENODATA");
    },
    resolveSoa: async (name) => {
      queries.push(`SOA ${name}`);
      if (fail[name]) throw dnsError(fail[name]);
      const target = cname[name] ?? name;
      if (soa.includes(target)) return { nsname: `ns.${target}` };
      throw dnsError("ENODATA");
    },
    resolveTxt: async (name) => {
      queries.push(`TXT ${name}`);
      if (fail[name]) throw dnsError(fail[name]);
      const answer = txt[name];
      if (!answer) throw dnsError("ENOTFOUND");
      return answer;
    },
  };
  return { lookups, queries };
}

/** Cloudflare's real answer for a zone it hosts (fetched 2026-11-03). */
const CLOUDFLARE_SETTINGS = {
  providerId: "cloudflare.com",
  providerName: "cloudflare",
  providerDisplayName: "Cloudflare",
  urlSyncUX: "https://dash.cloudflare.com/domainconnect",
  urlAPI: "https://api.cloudflare.com/client/v4/dns/domainconnect",
};
const CLOUDFLARE_TXT = [["api.cloudflare.com/client/v4/dns/domainconnect"]];

function fakeHttp(routes: Record<string, { status: number; body?: unknown }>) {
  const requests: string[] = [];
  const getJson: GetJson = async (url) => {
    requests.push(url.toString());
    const route = routes[url.toString()];
    if (!route) throw new Error(`unexpected request ${url}`);
    return { status: route.status, body: route.body ?? null };
  };
  return { getJson, requests };
}

describe("finding the zone", () => {
  it("takes the most specific name with an SOA record", async () => {
    const { lookups } = fakeDns({ soa: ["brand.com", "com"] });
    expect(await findZone("go.brand.com", lookups)).toBe("brand.com");
    expect(await findZone("a.b.brand.com", lookups)).toBe("brand.com");
    expect(await findZone("brand.com", lookups)).toBe("brand.com");
  });

  it("stops at the registered domain, not the public suffix", async () => {
    // co.uk is a zone too; brand.co.uk is more specific.
    const { lookups } = fakeDns({ soa: ["brand.co.uk", "co.uk"] });
    expect(await findZone("go.brand.co.uk", lookups)).toBe("brand.co.uk");
  });

  it("skips a name with a CNAME even though its SOA query answers", async () => {
    // go.brand.com already points at a zone apex elsewhere.
    const { lookups } = fakeDns({
      soa: ["brand.com", "elsewhere.net"],
      cname: { "go.brand.com": "elsewhere.net" },
    });
    expect(await findZone("go.brand.com", lookups)).toBe("brand.com");
  });

  it("ignores a failing SOA query on a name with a CNAME", async () => {
    const { lookups } = fakeDns({ soa: ["brand.com"] });
    const quirky: DnsLookups = {
      ...lookups,
      resolveCname: async (name) =>
        name === "go.brand.com" ? ["edge.cdn.net"] : lookups.resolveCname(name),
      resolveSoa: async (name) => {
        if (name === "go.brand.com") throw dnsError("EBADRESP");
        return lookups.resolveSoa(name);
      },
    };
    expect(await findZone("go.brand.com", quirky)).toBe("brand.com");
  });

  it("finds a delegated subzone", async () => {
    const { lookups } = fakeDns({ soa: ["go.brand.com", "brand.com"] });
    expect(await findZone("go.brand.com", lookups)).toBe("go.brand.com");
  });

  it("reports null without a zone and throws when DNS can't answer", async () => {
    expect(await findZone("go.brand.com", fakeDns({}).lookups)).toBeNull();
    const failing = fakeDns({
      soa: ["brand.com"],
      fail: { "go.brand.com": "ESERVFAIL" },
    });
    await expect(findZone("go.brand.com", failing.lookups)).rejects.toThrow(
      DiscoveryUnavailableError,
    );
  });

  it("splits host and zone", () => {
    expect(hostInZone("go.brand.com", "brand.com")).toBe("go");
    expect(hostInZone("a.b.brand.com", "brand.com")).toBe("a.b");
    expect(hostInZone("brand.com", "brand.com")).toBe("");
    expect(hostInZone("go.brand.com", "other.com")).toBeNull();
    // A suffix that isn't on a label boundary isn't the zone.
    expect(hostInZone("gobrand.com", "brand.com")).toBeNull();
  });
});

describe("the _domainconnect record", () => {
  it("reads the provider's API prefix", () => {
    expect(parseDiscoveryRecord(CLOUDFLARE_TXT)).toBe(
      "https://api.cloudflare.com/client/v4/dns/domainconnect",
    );
    expect(parseDiscoveryRecord([["domainconnect.api.godaddy.com"]])).toBe(
      "https://domainconnect.api.godaddy.com",
    );
    expect(parseDiscoveryRecord([["https://API.Example.net/dc/"]])).toBe(
      "https://api.example.net/dc",
    );
    expect(parseDiscoveryRecord([['"api.example.net"']])).toBe(
      "https://api.example.net",
    );
  });

  it("refuses values that could point the server at a private network", () => {
    for (const value of [
      "",
      "http://api.example.net",
      "ftp://api.example.net",
      "127.0.0.1",
      "169.254.169.254/latest",
      "localhost",
      "api.internal",
      "intranet",
      "api.example.net:8443",
      "api.example.net/?x=1",
      "user@api.example.net",
      "api.example.net/../x y",
    ]) {
      expect(parseDiscoveryRecord([[value]]), value).toBeNull();
    }
  });
});

describe("the settings JSON", () => {
  it("reads Cloudflare's answer", () => {
    expect(parseSettings(CLOUDFLARE_SETTINGS, "brand.com", "go")).toEqual({
      zone: "brand.com",
      host: "go",
      providerId: "cloudflare.com",
      providerName: "Cloudflare",
      urlSyncUX: "https://dash.cloudflare.com/domainconnect",
      urlAPI: "https://api.cloudflare.com/client/v4/dns/domainconnect",
    });
  });

  it("needs a synchronous flow and safe https URLs", () => {
    const { urlSyncUX: _, ...asyncOnly } = CLOUDFLARE_SETTINGS;
    expect(parseSettings(asyncOnly, "brand.com", "go")).toBeNull();
    expect(
      parseSettings(
        { ...CLOUDFLARE_SETTINGS, urlAPI: "http://api.example.net" },
        "brand.com",
        "go",
      ),
    ).toBeNull();
    expect(
      parseSettings(
        { ...CLOUDFLARE_SETTINGS, urlAPI: "https://10.0.0.1/dc" },
        "brand.com",
        "go",
      ),
    ).toBeNull();
    expect(parseSettings("<html>", "brand.com", "go")).toBeNull();
  });

  it("keeps the button label short and clean", () => {
    const named = (providerDisplayName?: string, providerName = "dnsco") =>
      parseSettings(
        { ...CLOUDFLARE_SETTINGS, providerDisplayName, providerName },
        "brand.com",
        "go",
      )?.providerName;
    expect(named(undefined, "Example DNS")).toBe("Example DNS");
    expect(named("x".repeat(41), "Example DNS")).toBe("Example DNS");
    expect(named("Brand\u0007 \n DNS")).toBe("Brand DNS");
    expect(named("x".repeat(41), "y".repeat(41))).toBeNull();
  });
});

describe("discovering a domain's DNS provider", () => {
  const zone: FakeZone = {
    soa: ["brand.com", "com"],
    txt: { "_domainconnect.brand.com": CLOUDFLARE_TXT },
  };
  const settingsUrl =
    "https://api.cloudflare.com/client/v4/dns/domainconnect/v2/brand.com/settings";

  it("walks zone → TXT → settings for a subdomain", async () => {
    const { lookups, queries } = fakeDns(zone);
    const http = fakeHttp({
      [settingsUrl]: { status: 200, body: CLOUDFLARE_SETTINGS },
    });
    const found = await discoverDnsProvider("go.brand.com", {
      dns: lookups,
      getJson: http.getJson,
    });
    expect(found).toMatchObject({
      zone: "brand.com",
      host: "go",
      providerName: "Cloudflare",
    });
    expect(queries).toContain("TXT _domainconnect.brand.com");
    // Discovery runs on the zone, never on the subdomain.
    expect(queries).not.toContain("TXT _domainconnect.go.brand.com");
    expect(http.requests).toEqual([settingsUrl]);
  });

  it("returns null when the zone has no record or isn't at that provider", async () => {
    const none = await discoverDnsProvider("go.brand.com", {
      dns: fakeDns({ soa: ["brand.com"] }).lookups,
      getJson: fakeHttp({}).getJson,
    });
    expect(none).toBeNull();

    const stale = await discoverDnsProvider("go.brand.com", {
      dns: fakeDns(zone).lookups,
      getJson: fakeHttp({ [settingsUrl]: { status: 404 } }).getJson,
    });
    expect(stale).toBeNull();
  });

  it("throws a retryable error when the provider or DNS is down", async () => {
    await expect(
      discoverDnsProvider("go.brand.com", {
        dns: fakeDns(zone).lookups,
        getJson: fakeHttp({ [settingsUrl]: { status: 503 } }).getJson,
      }),
    ).rejects.toThrow(DiscoveryUnavailableError);
    await expect(
      discoverDnsProvider("go.brand.com", {
        dns: fakeDns({
          ...zone,
          fail: { "_domainconnect.brand.com": "ETIMEOUT" },
        }).lookups,
        getJson: fakeHttp({}).getJson,
      }),
    ).rejects.toThrow(DiscoveryUnavailableError);
  });
});

describe("the template check", () => {
  const api = "https://api.cloudflare.com/client/v4/dns/domainconnect";
  const url = `${api}/v2/domainTemplates/providers/qrdx.dev/services/qrdx`;
  const template = { providerId: "qrdx.dev", serviceId: "qrdx" };

  it("is supported on 2xx and not on 404", async () => {
    const ok = fakeHttp({ [url]: { status: 200 } });
    expect(await isTemplateSupported(api, template, ok.getJson)).toBe(true);
    expect(ok.requests).toEqual([url]);
    const unknown = fakeHttp({
      [url]: { status: 404, body: { error: "unknown template" } },
    });
    expect(await isTemplateSupported(api, template, unknown.getJson)).toBe(
      false,
    );
  });

  it("throws on anything else", async () => {
    await expect(
      isTemplateSupported(
        api,
        template,
        fakeHttp({ [url]: { status: 500 } }).getJson,
      ),
    ).rejects.toThrow(DiscoveryUnavailableError);
  });
});
