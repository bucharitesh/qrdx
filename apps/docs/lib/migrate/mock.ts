"use client";

// Dev-only stand-in for /api/migrate/** (loaded only when NODE_ENV is
// "development" and the URL has ?mock=1). It runs the real importer against
// an in-memory workspace and fake provider accounts: no session, no database,
// no provider calls. All names, domains and URLs are made up.

import { IntegrationApiError } from "@repo/integrations/src/core/http-client";
import type { MigrateClient } from "./client";
import { MigrateApiError } from "./client";
import {
  attachJobDomain,
  getJob,
  ImportError,
  type ImporterDeps,
  listJobs,
  type MigrateRepo,
  previewImport,
  runJobChunk,
  runRedirects,
  resetRedirectErrors,
  startJob,
} from "./importer";
import {
  buildImportNotes,
  destinationKey,
  parseImportMarkers,
} from "./normalize";
import { filterPage } from "./adapters";
import { API_PROVIDER_IDS, type ApiProviderId } from "./providers";
import type {
  CodeRef,
  ImportJob,
  MigrationSource,
  ProvidersInfo,
  SourceLink,
} from "./types";

const PAGES = [
  ["Spring menu", "menu/spring", ["print", "menu"]],
  ["Table tent: Wi-Fi", "wifi", ["print"]],
  ["Leave a review", "review", ["reviews"]],
  ["Loyalty card sign-up", "loyalty", ["print", "loyalty"]],
  ["Catering order form", "catering", []],
  ["Summer tasting event", "events/summer-tasting", ["event"]],
  ["Gift cards", "gift-cards", ["sales"]],
  ["Allergen information", "menu/allergens", ["menu"]],
  ["Barista jobs", "careers/barista", []],
  ["Beans subscription", "shop/subscription", ["sales"]],
  ["Latte art class", "events/latte-art", ["event"]],
  ["Store hours", "hours", []],
] as const;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const fakeKey = (seed: number) =>
  Array.from({ length: 7 }, (_, i) => BASE62[(seed * 7919 + i * 104729) % 62]).join("");

const SHARED: Record<ApiProviderId, string> = {
  dub: "dub.sh",
  bitly: "bit.ly",
  rebrandly: "rebrand.ly",
  "short-io": "short.gy",
};
const BRANDED = "go.example.com";

function mockLinks(provider: ApiProviderId): SourceLink[] {
  const count = provider === "dub" ? 64 : 38;
  return Array.from({ length: count }, (_, index) => {
    const [title, path, tags] = PAGES[index % PAGES.length] as (typeof PAGES)[number];
    const round = Math.floor(index / PAGES.length);
    const branded = index % 3 === 0;
    const domain = branded ? BRANDED : SHARED[provider];
    // Branded links: mostly 7-character back-halves, a few readable ones.
    const backHalf =
      branded && index % 9 === 0 ? `${path.split("/").pop()}${round || ""}` : fakeKey(index + provider.length * 100);
    const shortLink = `https://${domain}/${backHalf}`;
    const id =
      provider === "bitly"
        ? `${domain}/${backHalf}`
        : provider === "dub"
          ? `link_${fakeKey(index + 5)}`
          : `lnk_${fakeKey(index + 9)}`;
    const created = new Date(Date.UTC(2023, (index * 5) % 12, 1 + (index % 27)));
    return {
      id,
      shortLink,
      domain,
      backHalf,
      destinationUrl: `https://example.com/${path}${round ? `?v=${round}` : ""}`,
      title: round ? `${title} (${round + 1})` : title,
      tags: [...tags],
      clicks:
        provider === "dub" || provider === "rebrandly"
          ? ((index * 137) % 2400) + 12
          : null,
      createdAt: created.toISOString(),
      archived: false,
    };
  });
}

interface MockCode {
  id: string;
  slug: string;
  url: string;
  notes: string | null;
  domainId: string | null;
}

function mockWorld(plan: "pro" | "free") {
  const codes: MockCode[] = [];
  let jobs: ImportJob[] = [];
  let seq = 0;
  const remaining = () =>
    plan === "free" ? Math.max(0, 10 - codes.length) : null;
  const ref = (code: MockCode): CodeRef => ({
    id: code.id,
    shortLink:
      code.domainId === "dom_mock"
        ? `https://${BRANDED}/${code.slug}`
        : `http://localhost:3000/q/${code.slug}`,
    state: "active",
  });
  const addCode = (url: string, notes: string | null) => {
    seq += 1;
    const code: MockCode = {
      id: `mock_${seq}`,
      slug: fakeKey(9000 + seq),
      url,
      notes,
      domainId: null,
    };
    codes.push(code);
    return code;
  };

  // Already in the workspace: one Dub link imported before, and a code
  // with the same destination as another link.
  const dub = mockLinks("dub");
  addCode(
    dub[2]?.destinationUrl ?? "",
    buildImportNotes({
      provider: "dub",
      key: dub[2]?.id ?? "",
      shortLink: dub[2]?.shortLink ?? null,
      createdAt: null,
      importedAt: new Date("2026-10-20"),
    }),
  );
  addCode(dub[4]?.destinationUrl ?? "", null);

  const repo: MigrateRepo = {
    async usage() {
      return { remaining: remaining(), bulk: plan !== "free" };
    },
    async findImported(_scope, provider, keys) {
      const map = new Map<string, CodeRef>();
      for (const code of codes) {
        for (const marker of parseImportMarkers(code.notes)) {
          const [p, ...rest] = marker.split(":");
          const key = rest.join(":");
          if (p === provider && (!keys || keys.includes(key))) {
            map.set(key, ref(code));
          }
        }
      }
      return map;
    },
    async findByDestinations(_scope, urls) {
      const wanted = new Set(urls.map(destinationKey));
      const map = new Map<string, CodeRef>();
      for (const code of codes) {
        const key = destinationKey(code.url);
        if (key && wanted.has(key)) map.set(key, ref(code));
      }
      return map;
    },
    async findTakenSlugs(slugs) {
      // "events1"-style back-halves pretend to belong to someone else.
      const used = new Set(codes.map((code) => code.slug));
      return new Set(slugs.filter((slug) => used.has(slug) || slug.startsWith("review")));
    },
    async existingTagNames() {
      return new Set(["print", "menu"]);
    },
    async domainFor(_scope, hostname) {
      return hostname === BRANDED
        ? { id: "dom_mock", qrdx: "verified" as const, canUse: plan !== "free" }
        : { id: null, qrdx: "missing" as const, canUse: plan !== "free" };
    },
    async qrdxHosts() {
      return new Set(["localhost:3000", "qrdx.dev"]);
    },
    checkDestination(url) {
      try {
        const parsed = new URL(url.trim());
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          return { ok: true, url: parsed.href };
        }
        return { ok: false, message: "Only http:// and https:// links can be used" };
      } catch {
        return { ok: false, message: "Enter a full URL, starting with https://" };
      }
    },
    async createCodes(_scope, inputs) {
      const left = remaining();
      if (left !== null && inputs.length > left) {
        throw new ImportError(402, "LIMIT_REACHED", "Your plan includes 10 active dynamic QR codes.");
      }
      return inputs.map((input) => {
        const code = addCode(input.destinationUrl, null);
        code.domainId = input.domainId;
        return { id: code.id, slug: code.slug, shortLink: ref(code).shortLink };
      });
    },
    async finishCodes(_scope, rows) {
      const result = new Map<string, { shortLink: string }>();
      for (const row of rows) {
        const code = codes.find((entry) => entry.id === row.codeId);
        if (!code) continue;
        code.notes = row.notes;
        if (row.slug) code.slug = row.slug;
        result.set(code.id, { shortLink: ref(code).shortLink });
      }
      return result;
    },
    async codesInScope(_scope, ids) {
      return new Set(ids.filter((id) => codes.some((code) => code.id === id)));
    },
    async attachDomain(_scope, ids, domainId) {
      let count = 0;
      for (const code of codes) {
        if (ids.includes(code.id)) {
          code.domainId = domainId;
          count += 1;
        }
      }
      return count;
    },
    async loadJobs() {
      return structuredClone(jobs);
    },
    async saveJobs(_userId, next) {
      jobs = structuredClone(next);
    },
    async claimChunk() {
      return true;
    },
  };
  return { repo };
}

function mockSource(provider: ApiProviderId): MigrationSource {
  const all = mockLinks(provider);
  const destinations = new Map(all.map((link) => [link.id, link.destinationUrl]));
  let edits = 0;
  return {
    provider,
    async listDomains() {
      return [BRANDED, SHARED[provider]];
    },
    async listLinks(cursor, filters) {
      const matching = filterPage(all, filters, {});
      const start = Number(cursor ?? 0);
      const links = matching.slice(start, start + 25).map((link) => ({
        ...link,
        destinationUrl: destinations.get(link.id) ?? link.destinationUrl,
      }));
      return {
        links,
        nextCursor: start + 25 < matching.length ? String(start + 25) : null,
        total: matching.length,
      };
    },
    async getLink(id) {
      const link = all.find((entry) => entry.id === id);
      return link
        ? { ...link, destinationUrl: destinations.get(id) ?? link.destinationUrl }
        : null;
    },
    async updateDestination(id, url) {
      // Bitly's lowest paid plan: 5 redirects a month.
      if (provider === "bitly" && edits >= 5) {
        throw new IntegrationApiError({
          provider: "bitly",
          status: 402,
          code: "upgrade_required",
          message: "UPGRADE_REQUIRED",
        });
      }
      edits += 1;
      destinations.set(id, url);
    },
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mapErrors<T>(fn: () => Promise<T>, delay = 250): Promise<T> {
  await wait(delay);
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ImportError) {
      throw new MigrateApiError(error.status, error.code, error.message);
    }
    throw error;
  }
}

export function createMockClient(plan: "pro" | "free" = "pro"): MigrateClient {
  const { repo } = mockWorld(plan);
  let id = 0;
  const deps: ImporterDeps = {
    repo,
    now: () => new Date(),
    newId: () => `mockjob_${++id}`,
  };
  const scope = { userId: "mock-user", organizationId: null };
  const sources = new Map(API_PROVIDER_IDS.map((p) => [p, mockSource(p)]));
  const connected = new Set<ApiProviderId>(["dub", "bitly", "short-io"]);
  const source = (provider: ApiProviderId) => sources.get(provider) as MigrationSource;

  return {
    mock: true,
    providers: () =>
      mapErrors(async (): Promise<ProvidersInfo> => {
        const used = (await repo.usage(scope)).remaining;
        return {
          providers: API_PROVIDER_IDS.map((p) => ({
            id: p,
            connection: connected.has(p) ? "active" : "none",
            oauth: p === "dub" || p === "bitly",
            apiKey:
              p === "dub"
                ? null
                : {
                    label: p === "bitly" ? "Generic access token" : "API key",
                    placeholder: "Paste your key",
                    helpText: "Create a key in the provider's account settings and paste it here.",
                  },
            available: true,
          })),
          usage: {
            plan,
            limit: plan === "free" ? 10 : null,
            used: plan === "free" ? 10 - (used ?? 0) : 2,
            remaining: used,
          },
          domains: {
            domains: [{ id: "dom_mock", hostname: BRANDED }],
            canUse: plan !== "free",
            defaultHost: "localhost:3000",
          },
        };
      }),
    links: (provider, cursor, filters) =>
      mapErrors(async () => {
        const page = await source(provider).listLinks(cursor, filters);
        const imported = await repo.findImported(
          scope,
          provider,
          page.links.map((link) => link.id),
        );
        return {
          ...page,
          domains: filters.withDomains
            ? ((await source(provider).listDomains?.()) ?? null)
            : null,
          imported: Object.fromEntries(
            [...imported].map(([key, value]) => [key, value.shortLink]),
          ),
        };
      }, 400),
    preview: (request) => mapErrors(() => previewImport(deps, scope, request), 450),
    start: (request) => mapErrors(() => startJob(deps, scope, request)),
    run: (jobId) => mapErrors(() => runJobChunk(deps, scope, jobId), 700),
    job: (jobId) => mapErrors(() => getJob(deps, scope, jobId), 100),
    jobs: () => mapErrors(() => listJobs(deps, scope), 100),
    redirects: (jobId, mode, retry) =>
      mapErrors(async () => {
        if (retry) await resetRedirectErrors(deps, scope, jobId);
        const { job } = await getJob(deps, scope, jobId);
        const provider = job.provider as ApiProviderId;
        return runRedirects(deps, scope, jobId, mode, source(provider));
      }, 600),
    attachDomain: (jobId) => mapErrors(() => attachJobDomain(deps, scope, jobId)),
    connectOAuth: async (provider) => {
      await wait(300);
      connected.add(provider);
      return "#connected";
    },
    connectKey: async (provider, key) => {
      await wait(400);
      if (key.trim().length < 8) return { ok: false, error: "That key looks too short" };
      connected.add(provider);
      return { ok: true };
    },
  };
}
