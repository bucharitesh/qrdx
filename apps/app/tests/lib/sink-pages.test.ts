// Response sync (HubSpot, Mailchimp) settings list the workspace's pages
// that have a form a page at a time (lib/data-connections/data.ts), instead
// of reading the 200 most recently updated pages and keeping those with a
// form, which hid older form pages. Also: saving keeps mappings for pages
// the panel never loaded, and the connected link list pages by number.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const fetched = vi.hoisted(() => ({
  urls: [] as string[],
  reply: { ok: true, body: {} as unknown },
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: async (url: string) => {
    fetched.urls.push(url);
    return {
      ok: fetched.reply.ok,
      json: async () => fetched.reply.body,
    };
  },
}));

const { formPagesByIds, listFormPages } = await import(
  "@/lib/data-connections/data"
);
const { mappingsToSave } = await import("@/lib/data-connections/sink-mappings");
const { fetchLinksPage } = await import(
  "@/app/(app)/settings/integrations/[slug]/components/link-pages"
);
const { DEFAULT_LANDING_THEME } = await import("@/types/landing");

const ORG = "org_acme";
const SCOPE = { userId: "u_ana", organizationId: ORG };
const SAME = new Date("2026-11-13T09:00:00Z");

const FORM = {
  id: "contact",
  type: "form",
  props: {
    title: "Contact",
    fields: [{ id: "email", type: "email", label: "Email", required: true }],
  },
};
const TEXT = { id: "intro", type: "text", props: { text: "Hello" } };

const pageId = (index: number) => `p${String(index).padStart(4, "0")}`;

/** `count` pages, scrambled; `hasForm(index)` decides which get a form. */
function seedPages(
  count: number,
  hasForm: (index: number) => boolean,
  overrides: (index: number) => Record<string, unknown> = () => ({}),
) {
  fakeDb.seed(
    "landingPage",
    Array.from({ length: count }, (_, i) => (i * 37) % count).map((index) => ({
      id: pageId(index),
      userId: "u_ana",
      organizationId: ORG,
      type: "blank",
      title: `Page ${index}`,
      content: {
        version: 1,
        theme: DEFAULT_LANDING_THEME,
        blocks: hasForm(index) ? [TEXT, FORM] : [TEXT],
      },
      version: 1,
      createdAt: SAME,
      updatedAt: SAME,
      ...overrides(index),
    })),
  );
}

async function readAll(q?: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let calls = 0; calls < 100; calls++) {
    const page = await listFormPages(SCOPE, { cursor, q });
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
    if (!cursor) return ids;
  }
  throw new Error("never reached the end");
}

beforeEach(() => {
  fakeDb.resetAll();
  fetched.urls = [];
});

describe("listFormPages", () => {
  it("finds every form page, including those past the 200 newest pages", async () => {
    // 260 pages, every third has a form; they all share one updated_at.
    seedPages(260, (index) => index % 3 === 0);
    const first = await listFormPages(SCOPE);
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.forms[0]).toMatchObject({
      id: "contact",
      title: "Contact",
    });
    const all = await readAll();
    const expected = Array.from({ length: 260 }, (_, i) => 259 - i)
      .filter((index) => index % 3 === 0)
      .map(pageId);
    expect(all).toEqual(expected);
    // The oldest form pages (ids below 60) used to fall past the cap.
    expect(all).toContain(pageId(0));
  });

  it("orders by last update, then id", async () => {
    seedPages(
      6,
      () => true,
      (index) => ({
        updatedAt: new Date(SAME.getTime() + (index % 2) * 60_000),
      }),
    );
    expect(await readAll()).toEqual([
      "p0005",
      "p0003",
      "p0001",
      "p0004",
      "p0002",
      "p0000",
    ]);
  });

  it("narrows by title on every page", async () => {
    seedPages(
      90,
      () => true,
      (index) => ({
        title: index % 2 === 0 ? `Spring menu ${index}` : `Other ${index}`,
      }),
    );
    const spring = await readAll("spring");
    expect(spring).toHaveLength(45);
    expect(spring.every((id) => Number(id.slice(1)) % 2 === 0)).toBe(true);
    expect(await readAll("nothing like this")).toEqual([]);
  });

  it("answers after reading 500 pages, with a cursor to carry on", async () => {
    // 600 newer pages without a form, then one older page with a form.
    seedPages(
      600,
      () => false,
      (index) => ({
        id: `n${String(index).padStart(4, "0")}`,
        updatedAt: new Date(SAME.getTime() + 60_000),
      }),
    );
    seedPages(1, () => true);
    const first = await listFormPages(SCOPE);
    expect(first.items).toEqual([]);
    expect(first.nextCursor).not.toBeNull();
    const second = await listFormPages(SCOPE, { cursor: first.nextCursor });
    expect(second.items.map((item) => item.id)).toEqual(["p0000"]);
    expect(second.nextCursor).toBeNull();
  });

  it("leaves out other workspaces' pages and pages that can't be read", async () => {
    seedPages(3, () => true);
    seedPages(
      2,
      () => true,
      (index) => ({
        id: `other${index}`,
        organizationId: "org_other",
      }),
    );
    fakeDb.seed("landingPage", [
      {
        id: "broken",
        userId: "u_ana",
        organizationId: ORG,
        type: "blank",
        title: "Broken",
        content: { nope: true },
        version: 1,
        createdAt: SAME,
        updatedAt: SAME,
      },
    ]);
    expect(await readAll()).toEqual(["p0002", "p0001", "p0000"]);
  });
});

describe("formPagesByIds", () => {
  it("loads the selected pages wherever they sit, in this workspace only", async () => {
    seedPages(300, (index) => index % 2 === 0);
    seedPages(
      1,
      () => true,
      () => ({ id: "theirs", organizationId: "org_x" }),
    );
    const pages = await formPagesByIds(SCOPE, [
      pageId(0),
      pageId(1), // no form
      pageId(298),
      "theirs",
    ]);
    expect(pages.map((page) => page.id).sort()).toEqual([
      pageId(0),
      pageId(298),
    ]);
    expect(await formPagesByIds(SCOPE, [])).toEqual([]);
  });
});

describe("mappingsToSave", () => {
  const map = (target: string) => ({
    fields: { email: target },
    consentFieldId: null,
  });

  it("keeps mappings of pages the panel never loaded", () => {
    const saved = {
      "old:contact": map("email"),
      "loaded:contact": map("email"),
      "dropped:contact": map("email"),
    };
    const result = mappingsToSave(saved, new Set(["loaded", "dropped"]), {
      "loaded:contact": map("phone"),
      "new:form": map("email"),
    });
    expect(result).toEqual({
      "old:contact": map("email"),
      "loaded:contact": map("phone"),
      "new:form": map("email"),
    });
  });
});

describe("fetchLinksPage (the connected link list)", () => {
  it("asks for a page by number and points at the next one while there's more", async () => {
    fetched.reply = {
      ok: true,
      body: { links: [{ id: "l1" }, { id: "l2" }], meta: { hasMore: true } },
    };
    const page = await fetchLinksPage("menu", 3, "failed");
    expect(page.items.map((link) => link.id)).toEqual(["l1", "l2"]);
    expect(page.nextCursor).toBe("4");
    const url = new URL(fetched.urls[0] ?? "", "https://x.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "3",
      pageSize: "25",
      search: "menu",
    });
  });

  it("ends without more, and fixes a bad page number", async () => {
    fetched.reply = { ok: true, body: { links: [], meta: { hasMore: false } } };
    const page = await fetchLinksPage("", Number.NaN, "failed");
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(fetched.urls[0]).toContain("page=1");
    expect(fetched.urls[0]).not.toContain("search=");
  });

  it("throws the caller's message when the request fails", async () => {
    fetched.reply = { ok: false, body: {} };
    await expect(fetchLinksPage("", 1, "Couldn't load")).rejects.toThrow(
      "Couldn't load",
    );
  });
});
