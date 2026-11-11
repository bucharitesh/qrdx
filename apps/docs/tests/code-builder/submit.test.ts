// Create and Save (components/code-builder/submit.ts) against fake server
// actions: nothing here reaches a database.
import { describe, expect, it, vi } from "vitest";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  listItemFromView,
  mergeOptimisticCodes,
  type OptimisticEntry,
  settledKeys,
} from "@/components/code-builder/optimistic";
import {
  type BuilderServices,
  submitCreate,
  submitUpdate,
} from "@/components/code-builder/submit";
import {
  type BuilderFields,
  EMPTY_FIELDS,
} from "@/components/code-builder/types";
import { MAX_SAVED_STYLE_LENGTH } from "@/components/code-builder/validation";

const view = (patch: Partial<QrCodeView> = {}): QrCodeView => ({
  id: "code_1",
  slug: "abc1234",
  shortLink: "https://qrdx.dev/q/abc1234",
  defaultShortLink: "https://qrdx.dev/q/abc1234",
  domain: null,
  destinationUrl: "https://example.com/a",
  kind: "redirect",
  pageId: null,
  title: "Menu",
  contentType: "url",
  style: null,
  status: "active",
  scanCount: 0,
  lastScannedAt: null,
  archivedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  organizationId: null,
  createdBy: "u1",
  ...patch,
});

type Fakes = {
  [K in keyof BuilderServices]: ReturnType<typeof vi.fn<BuilderServices[K]>>;
};

function fakes(
  overrides: Partial<{ [K in keyof BuilderServices]: BuilderServices[K] }> = {},
): Fakes {
  const services = {
    createCode: vi.fn<BuilderServices["createCode"]>(async () => ({
      success: true as const,
      data: view(),
    })),
    updateCode: vi.fn<BuilderServices["updateCode"]>(async (input) => ({
      success: true as const,
      data: view({ title: input.title ?? "Menu" }),
    })),
    moveCodes: vi.fn<BuilderServices["moveCodes"]>(async () => ({
      success: true as const,
      data: { updated: 1 },
    })),
    setTags: vi.fn<BuilderServices["setTags"]>(async () => ({
      success: true as const,
      data: undefined,
    })),
  };
  for (const [key, fn] of Object.entries(overrides)) {
    if (fn)
      services[key as keyof BuilderServices] = vi.fn(fn as never) as never;
  }
  return services;
}

const fields = (patch: Partial<BuilderFields> = {}): BuilderFields => ({
  ...EMPTY_FIELDS,
  destination: "example.com/menu",
  ...patch,
});

describe("create", () => {
  it("posts the form once, letting the server pick the theme when the design is untouched", async () => {
    const services = fakes();
    const result = await submitCreate(fields({ title: "  " }), services);
    expect(result.ok).toBe(true);
    expect(services.createCode).toHaveBeenCalledWith({
      destinationUrl: "https://example.com/menu",
      title: null,
      domainId: null,
      slug: null,
    });
    expect(services.moveCodes).not.toHaveBeenCalled();
    expect(services.setTags).not.toHaveBeenCalled();
  });

  it("sends a touched design, a back-half and a domain", async () => {
    const services = fakes();
    await submitCreate(
      fields({
        slug: " spring-menu ",
        domainId: "dom_1",
        style: { bodyPattern: "rounded" },
      }),
      services,
    );
    expect(services.createCode).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "spring-menu",
        domainId: "dom_1",
        style: { bodyPattern: "rounded" },
      }),
    );
  });

  it("files the new code in its folder and tags after it exists", async () => {
    const services = fakes();
    await submitCreate(
      fields({ folderId: "fold_1", tagIds: ["t1", "t2"] }),
      services,
    );
    expect(services.moveCodes).toHaveBeenCalledWith({
      ids: ["code_1"],
      folderId: "fold_1",
    });
    expect(services.setTags).toHaveBeenCalledWith({
      codeId: "code_1",
      tagIds: ["t1", "t2"],
    });
  });

  it("says out loud when the folder or tags didn't apply", async () => {
    const services = fakes({
      setTags: vi.fn(async () => ({
        success: false as const,
        error: { code: "LIMIT_REACHED", message: "Too many tags." },
      })),
    });
    const result = await submitCreate(fields({ tagIds: ["t1"] }), services);
    expect(result).toMatchObject({
      ok: true,
      warnings: ["The tags weren't set: Too many tags."],
    });
  });

  it("stops before the server on an invalid destination", async () => {
    const services = fakes();
    const result = await submitCreate(
      fields({ destination: "ftp://example.com" }),
      services,
    );
    expect(result).toMatchObject({ ok: false, field: "destination" });
    expect(services.createCode).not.toHaveBeenCalled();
  });

  it("puts a taken back-half on the slug field", async () => {
    const services = fakes({
      createCode: vi.fn(async () => ({
        success: false as const,
        error: { code: "SLUG_TAKEN", message: "That back-half is taken." },
      })),
    });
    const result = await submitCreate(fields({ slug: "menu" }), services);
    expect(result).toEqual({
      ok: false,
      error: { code: "SLUG_TAKEN", message: "That back-half is taken." },
      field: "slug",
    });
  });

  it("turns a network failure into an error, never a crash", async () => {
    const services = fakes({
      createCode: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    const result = await submitCreate(fields(), services);
    expect(result).toMatchObject({
      ok: false,
      field: "form",
      error: { code: "UNKNOWN_ERROR" },
    });
  });

  it("leaves an oversized logo out and says so", async () => {
    const services = fakes();
    const result = await submitCreate(
      fields({ style: { customLogo: "A".repeat(MAX_SAVED_STYLE_LENGTH) } }),
      services,
    );
    expect(result).toMatchObject({ ok: true, styleTrimmed: true });
    expect(services.createCode.mock.calls[0]?.[0].style).toEqual({});
  });
});

describe("save", () => {
  const code = view();
  const initial: BuilderFields = {
    ...EMPTY_FIELDS,
    destination: code.destinationUrl,
    title: "Menu",
    slug: code.slug,
    folderId: "fold_1",
    tagIds: ["t1"],
  };

  it("sends only what changed", async () => {
    const services = fakes();
    await submitUpdate(
      code,
      initial,
      { ...initial, title: "Spring menu" },
      services,
      { organizationKnown: true },
    );
    expect(services.updateCode).toHaveBeenCalledWith({
      id: "code_1",
      title: "Spring menu",
    });
    expect(services.moveCodes).not.toHaveBeenCalled();
    expect(services.setTags).not.toHaveBeenCalled();
  });

  it("moves and retags without touching the code's fields", async () => {
    const services = fakes();
    await submitUpdate(
      code,
      initial,
      { ...initial, folderId: null, tagIds: ["t1", "t3"] },
      services,
      { organizationKnown: true },
    );
    expect(services.updateCode).not.toHaveBeenCalled();
    expect(services.moveCodes).toHaveBeenCalledWith({
      ids: ["code_1"],
      folderId: null,
    });
    expect(services.setTags).toHaveBeenCalledWith({
      codeId: "code_1",
      tagIds: ["t1", "t3"],
    });
  });

  it("never sends folder or tags it couldn't look up", async () => {
    const services = fakes();
    await submitUpdate(
      code,
      initial,
      { ...initial, folderId: "other" },
      services,
      { organizationKnown: false },
    );
    expect(services.moveCodes).not.toHaveBeenCalled();
  });

  it("leaves a hosted page's destination to the page editor", async () => {
    const services = fakes();
    const page = view({ kind: "page", pageId: "page_1" });
    await submitUpdate(
      page,
      initial,
      { ...initial, destination: "https://elsewhere.example", title: "Page" },
      services,
      { organizationKnown: true },
    );
    expect(services.updateCode).toHaveBeenCalledWith({
      id: "code_1",
      title: "Page",
    });
  });
});

describe("optimistic list", () => {
  const row = listItemFromView(view(), { folderId: null, tags: [] });
  const other = listItemFromView(view({ id: "code_2", title: "Other" }), {
    folderId: null,
    tags: [],
  });

  it("applies a running edit to its row", () => {
    const entries: OptimisticEntry[] = [
      {
        key: "k1",
        kind: "update",
        codeId: "code_1",
        patch: { title: "Spring menu" },
        settledAt: null,
      },
    ];
    const merged = mergeOptimisticCodes([row, other], entries, {
      acceptNew: true,
    });
    expect(merged.map((item) => item.title)).toEqual(["Spring menu", "Other"]);
  });

  it("puts a new code on top of the plain list only, and never twice", () => {
    const created = listItemFromView(view({ id: "code_9", title: "New" }), {
      folderId: null,
      tags: [],
    });
    const entries: OptimisticEntry[] = [
      { key: "k2", kind: "create", code: created, settledAt: 10 },
    ];
    expect(
      mergeOptimisticCodes([row], entries, { acceptNew: true }).map(
        (item) => item.id,
      ),
    ).toEqual(["code_9", "code_1"]);
    expect(
      mergeOptimisticCodes([row], entries, { acceptNew: false }).map(
        (item) => item.id,
      ),
    ).toEqual(["code_1"]);
    expect(
      mergeOptimisticCodes([created, row], entries, { acceptNew: true }).map(
        (item) => item.id,
      ),
    ).toEqual(["code_9", "code_1"]);
  });

  it("forgets finished saves once a newer list arrives, never running ones", () => {
    const entries: OptimisticEntry[] = [
      {
        key: "running",
        kind: "update",
        codeId: "code_1",
        patch: {},
        settledAt: null,
      },
      {
        key: "done",
        kind: "update",
        codeId: "code_1",
        patch: {},
        settledAt: 100,
      },
    ];
    expect(settledKeys(entries, 50)).toEqual([]);
    expect(settledKeys(entries, 200)).toEqual(["done"]);
  });
});
