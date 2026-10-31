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
import { backHalfCandidates, backHalfShapeProblem } from "./back-halves";
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
  MAX_JOBS,
  nextChunk,
  readJobs,
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
import { type PlanContext, planImport, slugCandidates } from "./plan";
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
    taken?: string[];
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
    shortLink: `https://qrdx.dev/q/${code.slug}`,
    state: "active",
  });

  const repo: MigrateRepo = {
    async usage() {
      return { remaining, bulk: options.bulk ?? true };
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
    async findTakenSlugs(slugs) {
      const used = new Set([
        ...(options.taken ?? []),
        ...codes.map((code) => code.slug),
      ]);
      return new Set(slugs.filter((slug) => used.has(slug)));
    },
    async existingTagNames() {
      return new Set(["print"]);
    },
    async domainFor() {
      return { id: "dom_1", qrdx: "verified", canUse: true };
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
  return { repo, codes, calls, jobs: () => jobs };
}

function depsFor(repo: MigrateRepo): ImporterDeps {
  let id = 0;
  return {
    repo,
    now: () => new Date("2026-11-01T12:00:00.000Z"),
    newId: () => `job_${++id}`,
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
    fake.repo.usage = async () => ({ remaining: 4, bulk: true });
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

// ─── Branded back-halves ─────────────────────────────────────────────────────

describe("original back-halves", () => {
  const branded = (n: number, backHalf: string) =>
    link(n, {
      id: `go.brand.com/${backHalf}`,
      shortLink: `https://go.brand.com/${backHalf}`,
      domain: "go.brand.com",
      backHalf,
    });

  it("keeps 7-character back-halves and reports the rest with suggestions", async () => {
    const links = [
      branded(1, "Spring1"),
      branded(2, "spring-menu"),
      branded(3, "Taken01"),
      branded(4, "pricing"),
      link(5),
    ];
    const options = { ...OPTIONS, backHalfDomain: "go.brand.com" };
    const fake = fakeRepo({ taken: ["Taken01"] });
    const preview = await previewImport(depsFor(fake.repo), SCOPE, {
      provider: "dub",
      links,
      options,
    });
    const statuses = preview.items.map((item) => item.backHalf?.status ?? null);
    assert.deepEqual(statuses, ["kept", "shape", "taken", "reserved", null]);
    assert.equal(preview.backHalves?.kept, 1);
    assert.equal(preview.backHalves?.conflicts, 3);
    assert.equal(preview.items[1]?.backHalf?.suggestion, "springm");
    assert.match(preview.items[1]?.reason ?? "", /7 letters or digits/);
  });

  it("claims kept back-halves as slugs on import, on the verified domain", async () => {
    const fake = fakeRepo();
    const deps = depsFor(fake.repo);
    const { job } = await startJob(deps, SCOPE, {
      provider: "dub",
      links: [branded(1, "Spring1"), link(2)],
      options: { ...OPTIONS, backHalfDomain: "go.brand.com" },
    });
    await runToEnd(deps, job.id);
    assert.equal(fake.codes[0]?.slug, "Spring1");
    assert.equal(fake.codes[0]?.domainId, "dom_1");
    assert.equal(fake.codes[1]?.domainId, null);
  });

  it("flags back-halves repeated in the selection", () => {
    const links = [
      branded(1, "Spring1"),
      { ...branded(2, "Spring1"), id: "other" },
    ];
    const options = { ...OPTIONS, backHalfDomain: "go.brand.com" };
    const { candidates } = slugCandidates(links, options);
    const { preview } = planImport(
      links,
      context({
        options,
        candidates,
        backHalfDomain: { qrdx: "verified", canUse: true },
      }),
    );
    assert.equal(preview.items[1]?.backHalf?.status, "repeated");
  });

  it("checks shape and builds close alternatives", () => {
    assert.equal(backHalfShapeProblem("AbC1234"), null);
    assert.equal(backHalfShapeProblem("abc"), "shape");
    assert.equal(backHalfShapeProblem("pricing"), "reserved");
    const list = backHalfCandidates("spring-menu", () => "Zz00000");
    assert.deepEqual(list.slice(0, 2), ["springm", "ingmenu"]);
    const short = backHalfCandidates("eat", () => "Zz00000");
    assert.match(short[0] ?? "", /^eat[0-9A-Za-z]{4}$/);
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
