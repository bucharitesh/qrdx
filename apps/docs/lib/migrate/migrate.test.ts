// Run: cd apps/docs && npx tsx --test lib/migrate/migrate.test.ts
// Everything here is in memory: a fake repo instead of the database and fake
// provider clients instead of HTTP. Nothing connects anywhere.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DubClient, ShortLinkClient } from "@repo/integrations";
import { IntegrationApiError } from "@repo/integrations/src/core/http-client";
import {
  dubSource,
  explainProviderError,
  filterPage,
  fromDubLink,
  fromShortLink,
  shortLinkSource,
} from "./adapters";
import { backHalfShapeProblem, fallbackCandidates } from "./back-halves";
import { detectFileProvider, guessFileMapping, linksFromRows } from "./files";
import {
  type CreateInput,
  type FinishInput,
  ImportError,
  type ImporterDeps,
  type MigrateRepo,
  previewImport,
  runJobChunk,
  runRedirects,
  type Scope,
  startJob,
} from "./importer";
import {
  applyChunk,
  createJob,
  isSameLink,
  MAX_JOBS,
  mappedItems,
  nextChunk,
  readJobs,
  redirectTargets,
  upsertJob,
} from "./jobs";
import { fitToLimit, mappingCsv, mappingText } from "./mapping";
import {
  buildImportNotes,
  cleanTags,
  cleanTitle,
  destinationKey,
  importMarker,
  parseImportMarkers,
  splitShortLink,
} from "./normalize";
import { type PlanContext, planImport, slugLookups } from "./plan";
import { parseProviderParam } from "./providers";
import type {
  CodeRef,
  ImportJob,
  ImportOptions,
  MigrationSource,
  SourceLink,
} from "./types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const OPTIONS: ImportOptions = {
  folderName: "Imported from Bitly",
  carryTags: true,
  includeDuplicates: false,
  backHalfDomain: null,
  keepBackHalves: false,
  useSuggestions: true,
  limit: null,
};

function link(n: number, patch: Partial<SourceLink> = {}): SourceLink {
  const backHalf = `Ab${String(n).padStart(5, "0")}`;
  return {
    id: `bit.ly/${backHalf}`,
    shortLink: `https://bit.ly/${backHalf}`,
    domain: "bit.ly",
    backHalf,
    destinationUrl: `https://example.com/page-${n}`,
    title: `Page ${n}`,
    tags: ["print"],
    clicks: null,
    createdAt: "2024-03-02T10:00:00.000Z",
    archived: false,
    ...patch,
  };
}

const okDestination = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? ({ ok: true, url: parsed.href } as const)
      : ({ ok: false, message: "Only http(s)" } as const);
  } catch {
    return { ok: false, message: "Enter a full URL" } as const;
  }
};

const SCOPE: Scope = { userId: "user_1", organizationId: null };

interface Code {
  id: string;
  slug: string;
  /** "" = qrdx.dev/q/, else the custom domain the back-half belongs to */
  slugScope: string;
  url: string;
  notes: string | null;
  tags: string[];
  folder: string | null;
  domainId: string | null;
  orgId: string | null;
}

/** In-memory MigrateRepo with knobs for failures. */
function fakeRepo(
  options: {
    remaining?: number | null;
    bulk?: boolean;
    /** Taken on qrdx.dev/q/ by someone else */
    taken?: string[];
    /** Taken on the custom domain (dom_1) by another code */
    takenOnDomain?: string[];
    customSlugs?: boolean;
    domain?: { id: string | null; qrdx: "verified" | "pending" | "missing" };
    failCreateFor?: string[];
    /** Throw the first time notes are written (a crash mid-chunk) */
    crashOnFinish?: boolean;
  } = {},
) {
  const codes: Code[] = [];
  let jobs: ImportJob[] = [];
  let remaining = options.remaining ?? null;
  let seq = 0;
  let crash = Boolean(options.crashOnFinish);
  const calls = { create: 0, finish: 0 };
  const ref = (code: Code): CodeRef => ({
    id: code.id,
    shortLink:
      code.slugScope === "dom_1" ||
      (code.domainId === "dom_1" && options.domain?.qrdx !== "pending")
        ? `https://go.brand.com/${code.slug}`
        : `https://qrdx.dev/q/${code.slug}`,
    state: "active",
  });

  const repo: MigrateRepo = {
    async usage() {
      return {
        remaining,
        bulk: options.bulk ?? true,
        customSlugs: options.customSlugs ?? true,
      };
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
      const keys = new Set(urls.map((url) => destinationKey(url)));
      const map = new Map<string, CodeRef>();
      for (const code of codes) {
        const key = destinationKey(code.url);
        if (key && keys.has(key)) map.set(key, ref(code));
      }
      return map;
    },
    async findTakenSlugs(slugs, domainId) {
      const used = new Set(
        domainId
          ? [
              ...(options.takenOnDomain ?? []),
              ...codes
                .filter(
                  (code) =>
                    code.domainId === domainId || code.slugScope === domainId,
                )
                .map((code) => code.slug),
            ]
          : [
              ...(options.taken ?? []),
              ...codes
                .filter((code) => code.slugScope === "")
                .map((code) => code.slug),
            ],
      );
      return new Set(slugs.filter((slug) => used.has(slug)));
    },
    async existingTagNames() {
      return new Set(["print"]);
    },
    async domainFor() {
      return {
        ...(options.domain ?? { id: "dom_1", qrdx: "verified" as const }),
        canUse: true,
      };
    },
    async qrdxHosts() {
      return new Set(["qrdx.dev"]);
    },
    checkDestination: okDestination,
    async createCodes(_scope, inputs: CreateInput[]) {
      calls.create += 1;
      const bad = inputs.find((input) =>
        options.failCreateFor?.includes(input.destinationUrl),
      );
      if (bad) {
        throw Object.assign(new Error("This destination was blocked"), {
          code: "UNSAFE_URL",
        });
      }
      if (remaining !== null && inputs.length > remaining) {
        throw Object.assign(new Error("Plan limit"), { code: "LIMIT_REACHED" });
      }
      if (remaining !== null) remaining -= inputs.length;
      const created = inputs.map((input) => {
        seq += 1;
        const code: Code = {
          id: `code_${seq}`,
          slug: `Rnd${String(seq).padStart(4, "0")}`,
          slugScope: "",
          url: input.destinationUrl,
          notes: null,
          tags: [],
          folder: null,
          domainId: input.domainId,
          orgId: null,
        };
        codes.push(code);
        return { id: code.id, slug: code.slug, shortLink: ref(code).shortLink };
      });
      return created;
    },
    async finishCodes(_scope, rows: FinishInput[]) {
      calls.finish += 1;
      if (crash) {
        crash = false;
        throw new Error("Connection lost");
      }
      const result = new Map<string, { shortLink: string }>();
      for (const row of rows) {
        const code = codes.find((entry) => entry.id === row.codeId);
        if (!code) continue;
        code.notes = row.notes;
        code.tags = row.tags;
        code.folder = row.folderName;
        if (row.bindDomainId) code.domainId = row.bindDomainId;
        if (row.slug) {
          code.slug = row.slug;
          code.slugScope = row.slugDomainId ?? "";
        }
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
  return { repo, codes, calls, jobs: () => jobs };
}

function depsFor(repo: MigrateRepo): ImporterDeps {
  let id = 0;
  return {
    repo,
    now: () => new Date("2026-11-01T12:00:00.000Z"),
    newId: () => `job_${++id}`,
    newSlug: () => "Zz00000",
  };
}

function context(patch: Partial<PlanContext> = {}): PlanContext {
  return {
    provider: "bitly",
    options: OPTIONS,
    imported: new Map(),
    byDestination: new Map(),
    takenSlugs: new Set(),
    candidates: new Map(),
    remaining: null,
    existingTags: new Set(),
    canKeepBackHalves: true,
    backHalfDomain: null,
    checkDestination: okDestination,
    qrdxHosts: new Set(["qrdx.dev"]),
    ...patch,
  };
}

async function runToEnd(deps: ImporterDeps, id: string) {
  let rounds = 0;
  for (;;) {
    rounds += 1;
    const result = await runJobChunk(deps, SCOPE, id);
    if (result.done) return { result, rounds };
    assert.ok(rounds < 100, "import never finished");
  }
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

describe("mapping provider links", () => {
  it("maps a Bitly/Rebrandly/Short.io ShortLink", () => {
    const mapped = fromShortLink({
      id: "bit.ly/3AbCdEf",
      shortUrl: "https://bit.ly/3AbCdEf",
      longUrl: "https://shop.example.com/spring?utm=print",
      title: "  Spring sale ",
      domain: "bit.ly",
      tags: ["print", "flyer"],
      createdAt: "2024-03-02T10:00:00Z",
    });
    assert.equal(mapped.backHalf, "3AbCdEf");
    assert.equal(mapped.domain, "bit.ly");
    assert.equal(mapped.title, "Spring sale");
    assert.equal(mapped.clicks, null);
    assert.deepEqual(mapped.tags, ["print", "flyer"]);
  });

  it("adds a scheme to Rebrandly-style short URLs", () => {
    const mapped = fromShortLink({
      id: "abc",
      shortUrl: "rebrand.ly/menu",
      longUrl: "https://example.com",
      domain: "rebrand.ly",
      clicks: 12,
    });
    assert.equal(mapped.shortLink, "https://rebrand.ly/menu");
    assert.equal(mapped.backHalf, "menu");
    assert.equal(mapped.clicks, 12);
  });

  it("maps Dub links, including tags and clicks the DubLink type omits", () => {
    const mapped = fromDubLink({
      id: "link_1",
      domain: "go.brand.com",
      key: "Spring1",
      url: "https://example.com/spring",
      shortLink: "https://go.brand.com/Spring1",
      tags: [{ id: "t1", name: "Print", color: "red" }],
      clicks: 40,
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    assert.ok(mapped);
    assert.equal(mapped.backHalf, "Spring1");
    assert.deepEqual(mapped.tags, ["Print"]);
    assert.equal(mapped.clicks, 40);
    assert.equal(fromDubLink({ id: 1 }), null);
  });

  it("builds notes with the source, the original date and a marker", () => {
    const notes = buildImportNotes({
      provider: "bitly",
      key: "bit.ly/3AbCdEf",
      shortLink: "https://bit.ly/3AbCdEf",
      createdAt: "2024-03-02T10:00:00Z",
      importedAt: new Date("2026-11-01T09:00:00Z"),
    });
    assert.equal(
      notes,
      "Imported from Bitly bit.ly/3AbCdEf on 2026-11-01.\nCreated in Bitly on 2024-03-02.\n[import:bitly:bit.ly/3AbCdEf]",
    );
    assert.deepEqual(parseImportMarkers(notes), ["bitly:bit.ly/3AbCdEf"]);
    assert.equal(importMarker("dub", "a]b\nc"), "[import:dub:abc]");
  });

  it("cleans titles and tags to QRdx limits", () => {
    assert.equal(cleanTitle("x".repeat(150))?.length, 100);
    assert.equal(cleanTitle("   "), null);
    const tags = cleanTags([
      "Print",
      "print",
      " a  b ",
      "y".repeat(40),
      ...Array.from({ length: 20 }, (_, i) => `t${i}`),
    ]);
    assert.equal(tags.length, 10);
    assert.deepEqual(tags.slice(0, 2), ["Print", "a b"]);
    assert.equal(tags[2]?.length, 32);
  });

  it("splits short links and parses provider params", () => {
    assert.deepEqual(splitShortLink("go.brand.com/menu/"), {
      domain: "go.brand.com",
      backHalf: "menu",
    });
    assert.equal(parseProviderParam("bitly-qr"), "bitly");
    assert.equal(parseProviderParam("QR-TIGER"), "qr-tiger");
    assert.equal(parseProviderParam("unknown"), null);
  });

  it("filters pages for providers without native filters", () => {
    const links = [
      link(1, { tags: ["Print"] }),
      link(2, { domain: "go.brand.com", tags: [] }),
    ];
    assert.equal(filterPage(links, { tag: "print" }, {}).length, 1);
    assert.equal(
      filterPage(links, { domain: "go.brand.com" }, {})[0]?.id,
      links[1]?.id,
    );
    assert.equal(filterPage(links, { search: "page-2" }, {}).length, 1);
  });
});

describe("adapters", () => {
  it("pages Dub by page number and stops on a short page", async () => {
    const calls: unknown[] = [];
    const client = {
      getLinks: async (params: unknown) => {
        calls.push(params);
        return [
          { id: "link_1", url: "https://a.com", domain: "dub.sh", key: "x" },
        ];
      },
    };
    const source = dubSource(client as unknown as DubClient);
    const page = await source.listLinks("3", { search: "a" });
    assert.equal(page.nextCursor, null);
    assert.equal(page.links[0]?.shortLink, "https://dub.sh/x");
    assert.deepEqual(calls[0], {
      page: 3,
      pageSize: 100,
      search: "a",
      domain: undefined,
      showArchived: false,
    });
  });

  it("maps a hostname filter to the provider's domain id", async () => {
    const seen: unknown[] = [];
    const client = {
      listDomains: async () => [
        { id: "42", hostname: "go.brand.com", branded: true },
      ],
      listLinks: async (opts: unknown) => {
        seen.push(opts);
        return { links: [], nextCursor: "tok" };
      },
      updateLinkDestination: async () => ({}),
    };
    const source = shortLinkSource(
      "short-io",
      client as unknown as ShortLinkClient,
    );
    const page = await source.listLinks(null, { domain: "go.brand.com" });
    assert.equal(page.nextCursor, "tok");
    assert.equal((seen[0] as { domainId: string }).domainId, "42");
    const none = await source.listLinks(null, { domain: "other.com" });
    assert.equal(none.links.length, 0);
  });
});

// ─── Dedupe ──────────────────────────────────────────────────────────────────

describe("dedupe", () => {
  it("skips links already imported and destinations that already exist", () => {
    const existing: CodeRef = {
      id: "code_9",
      shortLink: "https://qrdx.dev/q/Exist01",
      state: "active",
    };
    const { preview } = planImport(
      [link(1), link(2), link(3)],
      context({
        imported: new Map([[link(1).id, existing]]),
        byDestination: new Map([
          [destinationKey("https://example.com/page-2/") ?? "", existing],
        ]),
      }),
    );
    assert.equal(preview.creates, 1);
    assert.equal(preview.alreadyImported, 1);
    assert.equal(preview.duplicates, 1);
    assert.equal(preview.items[1]?.existing?.id, "code_9");
  });

  it("imports duplicates when asked, but never the same link twice", () => {
    const { preview } = planImport(
      [link(1), link(1), link(2)],
      context({
        options: { ...OPTIONS, includeDuplicates: true },
        byDestination: new Map([
          [
            destinationKey(link(2).destinationUrl) ?? "",
            { id: "c", shortLink: "x", state: "active" },
          ],
        ]),
      }),
    );
    assert.equal(preview.creates, 2);
    assert.equal(preview.items[1]?.reason, "Selected twice");
  });

  it("rejects bad destinations and links that already point at QRdx", () => {
    const { preview } = planImport(
      [
        link(1, { destinationUrl: "ftp://x" }),
        link(2, { destinationUrl: "https://qrdx.dev/q/AbC1234" }),
        link(3, { destinationUrl: "" }),
      ],
      context(),
    );
    assert.equal(preview.invalid, 3);
    assert.equal(
      preview.items[1]?.reason,
      "Already points to a QRdx short link",
    );
  });

  it("reports branded domains and new versus existing tags", () => {
    const { preview } = planImport(
      [link(1, { domain: "go.brand.com", tags: ["Print", "Menu"] }), link(2)],
      context({ existingTags: new Set(["print"]) }),
    );
    assert.deepEqual(preview.brandedDomains, ["go.brand.com"]);
    assert.deepEqual(preview.newTags, ["Menu"]);
    assert.deepEqual(preview.existingTags, ["Print"]);
  });
});

// ─── Limits ──────────────────────────────────────────────────────────────────

describe("plan limit", () => {
  it("marks links past the free slots as over the limit", () => {
    const links = Array.from({ length: 12 }, (_, i) => link(i));
    const { preview } = planImport(links, context({ remaining: 7 }));
    assert.equal(preview.creates, 7);
    assert.equal(preview.overLimit, 5);
    assert.equal(preview.wanted, 12);
    assert.equal(preview.items[7]?.status, "over-limit");
  });

  it("honors 'import the first N'", () => {
    const links = Array.from({ length: 5 }, (_, i) => link(i));
    const { preview } = planImport(
      links,
      context({ options: { ...OPTIONS, limit: 2 } }),
    );
    assert.equal(preview.creates, 2);
  });

  it("says how many fit", () => {
    assert.deepEqual(fitToLimit(12, 7), { fits: 7, over: 5 });
    assert.deepEqual(fitToLimit(3, null), { fits: 3, over: 0 });
    assert.deepEqual(fitToLimit(3, 0), { fits: 0, over: 3 });
  });

  it("refuses to start when nothing fits", async () => {
    const { repo } = fakeRepo({ remaining: 0 });
    await assert.rejects(
      startJob(depsFor(repo), SCOPE, {
        provider: "bitly",
        links: [link(1)],
        options: OPTIONS,
      }),
      (error: unknown) =>
        error instanceof ImportError && error.code === "LIMIT_REACHED",
    );
  });

  it("re-checks the limit while running (codes made elsewhere meanwhile)", async () => {
    const fake = fakeRepo({ remaining: 10 });
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links: Array.from({ length: 10 }, (_, i) => link(i)),
      options: OPTIONS,
    });
    // Another tab used 6 slots after the job started.
    fake.repo.usage = async () => ({
      remaining: 4,
      bulk: true,
      customSlugs: true,
    });
    const { result } = await runToEnd(deps, job.id);
    assert.equal(result.job.created, 4);
    assert.equal(result.job.skipped, 6);
  });
});

// ─── Chunking + resume ───────────────────────────────────────────────────────

describe("chunking and resume", () => {
  it("creates 120 links in chunks of 50 with notes, tags and folder", async () => {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const links = Array.from({ length: 120 }, (_, i) => link(i));
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links,
      options: OPTIONS,
    });
    const first = await runJobChunk(deps, SCOPE, job.id);
    assert.equal(first.items.length, 50);
    assert.equal(first.done, false);
    const { result, rounds } = await runToEnd(deps, job.id);
    assert.equal(rounds, 2);
    assert.equal(result.job.created, 120);
    assert.equal(fake.codes.length, 120);
    assert.equal(fake.calls.create, 3);
    const code = fake.codes[0] as Code;
    assert.match(
      code.notes ?? "",
      /^Imported from Bitly bit\.ly\/Ab00000 on 2026-11-01\./,
    );
    assert.equal(code.folder, "Imported from Bitly");
    assert.deepEqual(code.tags, ["print"]);
  });

  it("is idempotent: a re-import of the same links creates nothing", async () => {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const request = {
      provider: "bitly" as const,
      links: [link(1), link(2)],
      options: OPTIONS,
    };
    const first = await startJob(deps, SCOPE, request);
    await runToEnd(deps, first.job.id);
    const again = await startJob(deps, SCOPE, request);
    assert.equal(again.preview.alreadyImported, 2);
    assert.equal(again.job.status, "done");
    assert.equal(fake.codes.length, 2);
  });

  it("resumes after a crash without duplicating codes", async () => {
    const fake = fakeRepo({ crashOnFinish: true });
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "dub",
      links: [link(1), link(2), link(3)],
      options: OPTIONS,
    });
    // Codes are created, then the request dies before notes are written.
    await assert.rejects(runJobChunk(deps, SCOPE, job.id), /Connection lost/);
    assert.equal(fake.codes.length, 3);
    assert.equal(fake.codes.filter((code) => code.notes).length, 0);
    // The retry finishes those codes instead of creating new ones.
    const { result } = await runToEnd(deps, job.id);
    assert.equal(result.job.created, 3);
    assert.equal(fake.codes.length, 3);
    assert.equal(fake.codes.filter((code) => code.notes).length, 3);
    assert.deepEqual(fake.codes[2]?.tags, ["print"]);
  });

  it("never creates twice when a retried chunk finds its markers", async () => {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const first = await startJob(deps, SCOPE, {
      provider: "dub",
      links: [link(1), link(2)],
      options: OPTIONS,
    });
    // Another job with the same links runs while the first is unfinished.
    const second = await startJob(deps, SCOPE, {
      provider: "dub",
      links: [link(1), link(2)],
      options: OPTIONS,
    });
    await runToEnd(deps, first.job.id);
    const { result } = await runToEnd(deps, second.job.id);
    assert.equal(result.job.created, 0);
    assert.equal(result.job.skipped, 2);
    assert.equal(fake.codes.length, 2);
  });

  it("isolates a blocked destination instead of failing the chunk", async () => {
    const fake = fakeRepo({ failCreateFor: ["https://example.com/page-2"] });
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links: [link(1), link(2), link(3)],
      options: OPTIONS,
    });
    const { result } = await runToEnd(deps, job.id);
    assert.equal(result.job.created, 2);
    assert.equal(result.job.failed, 1);
  });

  it("creates one at a time on plans without bulk creation", async () => {
    const fake = fakeRepo({ bulk: false, remaining: 10 });
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links: [link(1), link(2), link(3)],
      options: OPTIONS,
    });
    await runToEnd(deps, job.id);
    assert.equal(fake.calls.create, 3);
  });

  it("keeps jobs of other workspaces out of reach", async () => {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links: [link(1)],
      options: OPTIONS,
    });
    await assert.rejects(
      runJobChunk(deps, { userId: "user_1", organizationId: "org_1" }, job.id),
      (error: unknown) => error instanceof ImportError && error.status === 404,
    );
  });

  it("advances the cursor and bounds the stored jobs", () => {
    const items = [link(1), link(2)].map((entry) => ({
      key: entry.id,
      shortLink: entry.shortLink,
      url: entry.destinationUrl,
      title: null,
      tags: [],
      createdAt: null,
      slug: null,
      status: "pending" as const,
    }));
    let job = createJob({
      id: "j",
      provider: "bitly",
      organizationId: null,
      options: OPTIONS,
      items,
      now: new Date(),
    });
    assert.deepEqual(nextChunk(job, 1), [0]);
    job = applyChunk(
      job,
      new Map([[items[0]?.key ?? "", { status: "created" }]]),
      new Date(),
    );
    assert.equal(job.cursor, 1);
    const many = Array.from({ length: MAX_JOBS + 5 }, (_, i) => ({
      ...job,
      id: `j${i}`,
    }));
    const stored = many.reduce<ImportJob[]>(
      (all, entry) => upsertJob(all, entry),
      [],
    );
    assert.equal(stored.length, MAX_JOBS);
    assert.equal(
      readJobs({ v: 1, jobs: [...stored, { broken: true }] }).length,
      MAX_JOBS,
    );
    assert.deepEqual(readJobs(null), []);
  });
});

// ─── Redirects + undo ────────────────────────────────────────────────────────

function fakeSource(
  options: { failAfter?: number; error?: unknown; current?: string } = {},
) {
  const destinations = new Map<string, string>();
  let updates = 0;
  const source: MigrationSource = {
    provider: "bitly",
    async listLinks() {
      return { links: [], nextCursor: null, total: null };
    },
    async getLink(id) {
      return options.current
        ? link(0, { id, destinationUrl: options.current })
        : null;
    },
    async updateDestination(id, url) {
      if (options.failAfter !== undefined && updates >= options.failAfter) {
        throw options.error;
      }
      updates += 1;
      destinations.set(id, url);
    },
  };
  return { source, destinations };
}

describe("keep printed codes working", () => {
  async function importedJob(count: number) {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links: Array.from({ length: count }, (_, i) => link(i)),
      options: OPTIONS,
    });
    await runToEnd(deps, job.id);
    return { fake, deps, id: job.id };
  }

  it("dry-runs every change without touching the provider", async () => {
    const { deps, id } = await importedJob(3);
    const { source, destinations } = fakeSource();
    const dry = await runRedirects(deps, SCOPE, id, "dry-run", source);
    assert.equal(dry.items.length, 3);
    assert.equal(dry.items[0]?.from, "https://example.com/page-0");
    assert.match(dry.items[0]?.to ?? "", /^https:\/\/qrdx\.dev\/q\//);
    assert.equal(destinations.size, 0);
  });

  it("applies in batches, records originals, and undo restores them", async () => {
    const { deps, id } = await importedJob(25);
    const { source, destinations } = fakeSource({
      current: "https://example.com/changed-since",
    });
    const first = await runRedirects(deps, SCOPE, id, "apply", source);
    assert.equal(first.items.length, 20);
    assert.equal(first.remaining, 5);
    const second = await runRedirects(deps, SCOPE, id, "apply", source);
    assert.equal(second.remaining, 0);
    assert.equal(second.job.redirected, 25);
    assert.match(destinations.get(link(0).id) ?? "", /qrdx\.dev\/q\//);

    let undo = await runRedirects(deps, SCOPE, id, "undo", source);
    while (undo.remaining > 0) {
      undo = await runRedirects(deps, SCOPE, id, "undo", source);
    }
    assert.equal(undo.job.undone, 25);
    assert.equal(undo.job.redirected, 0);
    // The destination at the moment of the update, not the import.
    assert.equal(
      destinations.get(link(0).id),
      "https://example.com/changed-since",
    );
  });

  it("stops with a plain message when the plan has no redirects left", async () => {
    const { deps, id } = await importedJob(5);
    const { source } = fakeSource({
      failAfter: 2,
      error: new IntegrationApiError({
        provider: "bitly",
        status: 402,
        code: "upgrade_required",
        message: "UPGRADE_REQUIRED",
      }),
    });
    const result = await runRedirects(deps, SCOPE, id, "apply", source);
    assert.equal(result.job.redirected, 2);
    assert.match(result.stopped ?? "", /Bitly plan/);
    assert.equal(result.remaining, 3);
  });

  it("explains provider errors in plain words", () => {
    const quota = explainProviderError(
      "bitly",
      new IntegrationApiError({
        provider: "bitly",
        status: 429,
        code: "rate_limited",
        message: "x",
        body: { message: "MONTHLY_LIMIT_EXCEEDED" },
      }),
    );
    assert.equal(quota.kind, "quota");
    assert.equal(
      explainProviderError("dub", new Error("Dub API error: 401 - no")).kind,
      "auth",
    );
    const missing = explainProviderError(
      "rebrandly",
      new IntegrationApiError({
        provider: "rebrandly",
        status: 404,
        code: "not_found",
        message: "x",
      }),
    );
    assert.equal(missing.stop, false);
  });

  it("refuses file imports (their codes are re-pointed by hand)", async () => {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "uniqode",
      links: [link(1)],
      options: OPTIONS,
    });
    await assert.rejects(
      runRedirects(deps, SCOPE, job.id, "apply", fakeSource().source),
      (error: unknown) =>
        error instanceof ImportError && error.code === "NOT_SUPPORTED",
    );
  });

  it("exports the mapping for re-pointing by hand", async () => {
    const { fake, deps, id } = await importedJob(2);
    const jobs = await fake.repo.loadJobs("user_1");
    const items = jobs.find((job) => job.id === id)?.items ?? [];
    const csv = mappingCsv(items);
    assert.match(csv, /^old_link,old_id,new_qrdx_link,destination,status\r\n/);
    assert.equal(csv.trim().split("\r\n").length, 3);
    assert.match(mappingText(items), /bit\.ly\/Ab00000 → https:\/\/qrdx\.dev/);
    assert.ok(deps);
    assert.equal(
      mappingCsv([
        { ...(items[0] as ImportJob["items"][number]), url: "=HYPERLINK(1)" },
      ]).includes("'=HYPERLINK"),
      true,
    );
  });
});

// ─── Back-halves ─────────────────────────────────────────────────────────────

describe("original back-halves", () => {
  const branded = (n: number, backHalf: string) =>
    link(n, {
      id: `go.brand.com/${backHalf}`,
      shortLink: `https://go.brand.com/${backHalf}`,
      domain: "go.brand.com",
      backHalf,
    });
  const shared = (n: number, backHalf: string) =>
    link(n, {
      id: `bit.ly/${backHalf}`,
      shortLink: `https://bit.ly/${backHalf}`,
      backHalf,
    });
  const KEEP = { ...OPTIONS, keepBackHalves: true };
  const ON_DOMAIN = { ...KEEP, backHalfDomain: "go.brand.com" };

  it("keeps readable back-halves on qrdx.dev and generates the rest", async () => {
    const links = [
      shared(1, "spring-menu"),
      shared(2, "Taken01"),
      shared(3, "pricing"),
      shared(4, "menu/allergens"),
      shared(5, "ab"),
      link(6, { backHalf: null, shortLink: null, id: "no-link" }),
    ];
    const fake = fakeRepo({ taken: ["Taken01"] });
    const preview = await previewImport(depsFor(fake.repo), SCOPE, {
      provider: "bitly",
      links,
      options: KEEP,
    });
    const statuses = preview.items.map((item) => item.backHalf?.status ?? null);
    assert.deepEqual(statuses, [
      "kept",
      "taken",
      "reserved",
      "shape",
      "shape",
      null,
    ]);
    assert.equal(preview.items[0]?.backHalf?.target, "shared");
    assert.equal(preview.items[0]?.backHalf?.slug, "spring-menu");
    assert.equal(preview.backHalves?.kept, 1);
    assert.equal(preview.backHalves?.conflicts, 4);
    assert.equal(preview.backHalves?.domain, null);
    // The change the preview shows: a generated slug, and why.
    const taken = preview.items[1]?.backHalf;
    assert.match(taken?.slug ?? "", /^[0-9A-Za-z]{7}$/);
    assert.equal(taken?.slug, taken?.suggestion);
    assert.match(preview.items[1]?.reason ?? "", /already uses/);
    assert.match(preview.items[3]?.reason ?? "", /3 to 64 letters/);
  });

  it("shows the same generated slug in the preview and the import", async () => {
    const fake = fakeRepo({ taken: ["Taken01"] });
    const deps = depsFor(fake.repo);
    const request = {
      provider: "bitly" as const,
      links: [shared(1, "Taken01")],
      options: KEEP,
    };
    const preview = await previewImport(deps, SCOPE, request);
    const shown = preview.items[0]?.backHalf?.slug;
    const { job } = await startJob(deps, SCOPE, request);
    await runToEnd(deps, job.id);
    assert.ok(shown);
    assert.equal(fake.codes[0]?.slug, shown);
    assert.equal(fake.codes[0]?.slugScope, "");
  });

  it("claims kept back-halves on qrdx.dev on import", async () => {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links: [shared(1, "spring-menu"), link(2)],
      options: KEEP,
    });
    await runToEnd(deps, job.id);
    assert.equal(fake.codes[0]?.slug, "spring-menu");
    assert.equal(fake.codes[0]?.slugScope, "");
    assert.equal(fake.codes[0]?.domainId, null);
    // link(2) has a 7-character back-half: kept too.
    assert.equal(fake.codes[1]?.slug, "Ab00002");
  });

  it("keeps back-halves only when asked, and only on Pro", async () => {
    const links = [shared(1, "spring-menu")];
    const off = await previewImport(depsFor(fakeRepo().repo), SCOPE, {
      provider: "bitly",
      links,
      options: OPTIONS,
    });
    assert.equal(off.items[0]?.backHalf, null);
    assert.equal(off.backHalves, null);

    const free = await previewImport(
      depsFor(fakeRepo({ customSlugs: false }).repo),
      SCOPE,
      { provider: "bitly", links, options: KEEP },
    );
    assert.equal(free.canKeepBackHalves, false);
    assert.equal(free.backHalves?.canUse, false);
    assert.equal(free.items[0]?.backHalf, null);
  });

  it("keeps branded back-halves on the custom domain, unique per domain", async () => {
    const links = [
      branded(1, "spring-menu"),
      branded(2, "pricing"),
      branded(3, "mine"),
      branded(4, "api"),
      shared(5, "spring-menu"),
    ];
    // Someone else has spring-menu and pricing on qrdx.dev: irrelevant on the domain.
    const fake = fakeRepo({
      taken: ["spring-menu", "pricing"],
      takenOnDomain: ["mine"],
    });
    const preview = await previewImport(depsFor(fake.repo), SCOPE, {
      provider: "bitly",
      links,
      options: ON_DOMAIN,
    });
    const plans = preview.items.map((item) => [
      item.backHalf?.status,
      item.backHalf?.target,
    ]);
    assert.deepEqual(plans, [
      ["kept", "domain"],
      ["kept", "domain"],
      ["taken", "domain"],
      ["reserved", "domain"],
      ["taken", "shared"],
    ]);
    assert.match(preview.items[2]?.reason ?? "", /on go\.brand\.com/);
    assert.equal(preview.backHalves?.domain, "go.brand.com");
    assert.equal(preview.backHalves?.qrdx, "verified");
  });

  it("puts codes on a pending domain with their back-halves", async () => {
    const fake = fakeRepo({ domain: { id: "dom_1", qrdx: "pending" } });
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "bitly",
      links: [branded(1, "spring-menu"), shared(2, "summer")],
      options: ON_DOMAIN,
    });
    const { result } = await runToEnd(deps, job.id);
    assert.deepEqual(
      fake.codes.map((code) => [code.slug, code.slugScope, code.domainId]),
      [
        ["spring-menu", "dom_1", "dom_1"],
        ["summer", "", null],
      ],
    );
    // The codes are already on the domain: nothing left to attach.
    assert.ok(result.job.domainAttachedAt);
    // Its new link is the old one: no redirect to itself at the old provider.
    const items = fake.jobs()[0]?.items ?? [];
    assert.equal(items[0]?.newLink, "https://go.brand.com/spring-menu");
    const plan = await runRedirects(deps, SCOPE, job.id, "dry-run", null);
    assert.deepEqual(
      plan.items.map((item) => item.key),
      ["bit.ly/summer"],
    );
  });

  it("keeps branded back-halves on qrdx.dev while the domain isn't in QRdx", async () => {
    const fake = fakeRepo({
      domain: { id: null, qrdx: "missing" },
      taken: ["pricing"],
    });
    const preview = await previewImport(depsFor(fake.repo), SCOPE, {
      provider: "bitly",
      links: [branded(1, "spring-menu"), branded(2, "help")],
      options: ON_DOMAIN,
    });
    assert.deepEqual(
      preview.items.map((item) => [
        item.backHalf?.status,
        item.backHalf?.target,
      ]),
      [
        ["kept", "shared"],
        ["reserved", "shared"],
      ],
    );
    assert.match(preview.items[1]?.reason ?? "", /Add go\.brand\.com/);
    assert.equal(preview.backHalves?.qrdx, "missing");
  });

  it("flags back-halves repeated in the selection, per namespace", () => {
    const links = [
      branded(1, "Spring1"),
      { ...branded(2, "Spring1"), id: "other" },
      shared(3, "Spring1"),
    ];
    const domain = { qrdx: "verified" as const, canUse: true };
    const { candidates } = slugLookups(
      links,
      ON_DOMAIN,
      domain,
      () => "Zz00000",
    );
    const { preview } = planImport(
      links,
      context({ options: ON_DOMAIN, candidates, backHalfDomain: domain }),
    );
    assert.deepEqual(
      preview.items.map((item) => item.backHalf?.status),
      ["kept", "repeated", "kept"],
    );
  });

  it("looks slugs up in the right namespace", () => {
    const links = [branded(1, "spring-menu"), shared(2, "summer")];
    const domain = { qrdx: "pending" as const, canUse: true };
    const lookups = slugLookups(links, ON_DOMAIN, domain, () => "Zz00000");
    assert.deepEqual(lookups.domain, ["spring-menu"]);
    assert.ok(lookups.shared.includes("summer"));
    assert.ok(!lookups.shared.includes("spring-menu"));
    // Every link has generated fallbacks, looked up on qrdx.dev.
    for (const list of lookups.candidates.values()) {
      for (const slug of list) assert.ok(lookups.shared.includes(slug));
    }
  });

  it("checks shape by namespace and derives stable fallbacks", () => {
    assert.equal(backHalfShapeProblem("AbC1234", "shared"), null);
    assert.equal(backHalfShapeProblem("spring-menu", "shared"), null);
    assert.equal(backHalfShapeProblem("ab", "shared"), "shape");
    assert.equal(backHalfShapeProblem("-menu", "shared"), "shape");
    assert.equal(backHalfShapeProblem("menu/spring", "shared"), "shape");
    assert.equal(backHalfShapeProblem("x".repeat(65), "shared"), "shape");
    assert.equal(backHalfShapeProblem("pricing", "shared"), "reserved");
    assert.equal(backHalfShapeProblem("pricing", "domain"), null);
    assert.equal(backHalfShapeProblem("API", "domain"), "reserved");
    const first = fallbackCandidates("bit.ly/x", () => "Zz00000");
    assert.deepEqual(
      fallbackCandidates("bit.ly/x", () => "Yy11111").slice(0, 2),
      first.slice(0, 2),
    );
    for (const slug of first) assert.match(slug, /^[0-9A-Za-z]{7}$/);
    assert.equal(first.at(-1), "Zz00000");
  });

  it("never re-points a link at itself", () => {
    assert.equal(
      isSameLink("https://go.brand.com/menu", "https://go.brand.com/menu/"),
      true,
    );
    assert.equal(
      isSameLink("go.brand.com/menu", "https://GO.brand.com/menu"),
      true,
    );
    assert.equal(
      isSameLink("https://bit.ly/menu", "https://qrdx.dev/q/menu"),
      false,
    );
    const job = createJob({
      id: "job",
      provider: "bitly",
      organizationId: null,
      options: ON_DOMAIN,
      now: new Date(),
      items: [
        {
          key: "a",
          shortLink: "https://go.brand.com/menu",
          url: "https://example.com/a",
          title: null,
          tags: [],
          createdAt: null,
          slug: "menu",
          status: "created",
          codeId: "c1",
          newLink: "https://go.brand.com/menu",
        },
        {
          key: "b",
          shortLink: "https://bit.ly/b",
          url: "https://example.com/b",
          title: null,
          tags: [],
          createdAt: null,
          slug: null,
          status: "created",
          codeId: "c2",
          newLink: "https://qrdx.dev/q/Ab3xK9q",
        },
      ],
    });
    assert.deepEqual(
      redirectTargets(job).map((item) => item.key),
      ["b"],
    );
    // The mapping CSV still lists both.
    assert.equal(mappedItems(job).length, 2);
  });

  it("reads jobs saved before back-half namespaces existed", () => {
    const [job] = readJobs({
      v: 1,
      jobs: [
        {
          id: "old",
          provider: "dub",
          organizationId: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
          status: "done",
          options: {
            folderName: null,
            carryTags: true,
            includeDuplicates: false,
            backHalfDomain: "go.brand.com",
            useSuggestions: true,
            limit: null,
          },
          cursor: 1,
          items: [],
        },
      ],
    });
    assert.equal(job?.options.keepBackHalves, false);
  });
});

// ─── Export files ────────────────────────────────────────────────────────────

describe("export file auto-detection", () => {
  const cases: [string, string[], string][] = [
    [
      "uniqode",
      [
        "QR Code ID",
        "QR Code Name",
        "Organization name",
        "QR Code URL",
        "Destination URL",
        "QR Code Type",
        "Owner",
        "Creation Date & Timestamp",
        "Labels",
        "Frame Text details",
      ],
      "Destination URL",
    ],
    [
      "qr-tiger",
      ["ID", "Campaign Name", "Category", "Scan Count", "URL"],
      "URL",
    ],
    ["flowcode", ["Flowcode Name", "Flowcode Scan URL"], "Flowcode Scan URL"],
    [
      "tinyurl",
      ["Alias", "TinyURL", "Long URL", "Created", "Clicks"],
      "Long URL",
    ],
    [
      "scanova",
      [
        "QR ID",
        "Name",
        "Category",
        "Type",
        "Status",
        "Tags",
        "Short URL",
        "Creator",
        "Destination URL",
      ],
      "Destination URL",
    ],
    [
      "hovercode",
      ["Display name", "Hovercode link", "Destination", "Scans"],
      "Destination",
    ],
  ];
  for (const [provider, headers, destination] of cases) {
    it(`detects ${provider} and maps its destination column`, () => {
      const detected = detectFileProvider(headers, []);
      assert.equal(detected.provider, provider);
      assert.equal(detected.confidence, "high");
      const mapping = guessFileMapping(headers, detected.provider);
      assert.equal(headers[mapping.destination], destination);
    });
  }

  it("falls back to link hosts for files without a known header set", () => {
    const detected = detectFileProvider(
      ["Name", "Short", "Target"],
      [["Menu", "https://me-qr.com/l/abc", "https://example.com"]],
    );
    assert.deepEqual(detected, { provider: "me-qr", confidence: "medium" });
    const qrcg = detectFileProvider(
      ["Name", "Link", "URL"],
      [["Menu", "https://qr1.be/AB12", "https://example.com"]],
    );
    assert.equal(qrcg.provider, "qr-code-generator-pro");
  });

  it("treats unknown files as a generic CSV with sensible defaults", () => {
    const headers = ["Name", "Short URL", "Destination", "Tags", "Created"];
    const detected = detectFileProvider(headers, []);
    assert.equal(detected.provider, "csv");
    const mapping = guessFileMapping(headers, "csv");
    assert.deepEqual(mapping, {
      destination: 2,
      title: 0,
      shortLink: 1,
      id: -1,
      tags: 3,
      createdAt: 4,
      clicks: -1,
    });
  });

  it("turns rows into links with stable keys", () => {
    const mapping = guessFileMapping(
      ["Name", "Short URL", "Destination", "Tags", "Created", "Scans"],
      "csv",
    );
    const rows = [
      [
        "Menu",
        "qr1.be/AB12",
        "https://example.com/menu",
        "print; table",
        "2024-01-02",
        "1,204",
      ],
      ["", "", "", "", "", ""],
      ["Wi-Fi", "", "https://example.com/wifi", "", "not a date", "n/a"],
    ];
    const links = linksFromRows(rows, mapping);
    assert.equal(links.length, 2);
    assert.equal(links[0]?.id, "https://qr1.be/AB12");
    assert.deepEqual(links[0]?.tags, ["print", "table"]);
    assert.equal(links[0]?.clicks, 1204);
    assert.equal(links[0]?.createdAt, "2024-01-02T00:00:00.000Z");
    assert.match(links[1]?.id ?? "", /^row-/);
    assert.equal(links[1]?.createdAt, null);
    assert.equal(linksFromRows([rows[2] ?? []], mapping)[0]?.id, links[1]?.id);
  });
});
