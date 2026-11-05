// Community page templates: a hosted page published as a template is
// scrubbed of personal data first (lib/community/page-template.ts), only
// owners and admins of a shared workspace may publish one, the page is read
// from the database (never the client), and "Use template" copies it into
// the open workspace as a draft page (no QR code) within the page limit.
// In-memory tables (tests/support/fake-db); nothing connects anywhere.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "u_ana" as string | null,
  scope: null as null | {
    userId: string;
    organizationId: string;
    role: "owner" | "admin" | "member" | "viewer";
  },
  plan: "free" as string,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/shared", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getCurrentUserId: async () => {
      if (!state.userId) throw new UnauthorizedError();
      return state.userId;
    },
    logError: vi.fn(),
  };
});
vi.mock("@/lib/log-error", () => ({ logError: vi.fn() }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => null,
}));
vi.mock("@/lib/scope", async (importOriginal) => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    ...(await importOriginal<typeof import("@/lib/scope")>()),
    getActiveScope: vi.fn(async () => {
      if (!state.userId) throw new UnauthorizedError();
      if (!state.scope) throw new Error("test: no scope set");
      return state.scope;
    }),
  };
});
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlan: async () => state.plan,
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/limit-notices", () => ({ noteLimitUsage: vi.fn() }));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import {
  copyCommunityTemplate,
  previewCommunityPage,
  publishCommunityPage,
} from "@/actions/community";
import { getCommunityItem } from "@/lib/community/api";
import {
  isLibraryMedia,
  readPageTemplate,
  SAMPLE_EMAIL,
  SAMPLE_LINK,
  SAMPLE_PHONE,
  scrubPageContent,
  scrubSummary,
} from "@/lib/community/page-template";
import { getItem, itemsForReview } from "@/lib/community/queries";
import { createBlock, parseLandingPageContent } from "@/lib/landing/blocks";
import { buildTemplateContent, listTemplates } from "@/lib/landing/templates";
import { templateMediaUrl } from "@/lib/landing/templates/media";
import {
  DEFAULT_LANDING_THEME,
  type LandingBlock,
  type LandingPageContent,
} from "@/types/landing";
import { fakeDb } from "../support/fake-db";

const TEAM = "org_team";
const OWN = ownWorkspaceId("u_ana");
const NOW = new Date("2026-11-05T10:00:00Z");
const UPLOAD = "https://files.qrdx.dev/u/ana-photo.jpg";
const FILE_ID = "a1b2c3d4e5f6g7h8i9j0";
const LIBRARY_PHOTO = templateMediaUrl("hero-latte.webp");

function block(
  type: string,
  props: Record<string, unknown>,
  extra: Partial<LandingBlock> = {},
): LandingBlock {
  const base = createBlock(
    type,
    `${type}-${Math.random().toString(36).slice(2, 8)}`,
  );
  return { ...base, ...extra, props: { ...base.props, ...props } };
}

/** Someone's real page: every kind of personal detail a page can hold. */
function personalPage(): LandingPageContent {
  const content: LandingPageContent = {
    version: 1,
    theme: {
      ...DEFAULT_LANDING_THEME,
      background: { type: "image", url: UPLOAD, overlay: 0.3 },
      logo: { url: UPLOAD, alt: "Ana's logo" },
    },
    blocks: [
      block("header", {
        title: "Ana Ruiz Studio",
        subtitle: "Mail ana.ruiz@gmail.com or call +1 415 555 0132",
        avatar: { url: UPLOAD, alt: "Ana" },
        cover: { url: LIBRARY_PHOTO, alt: "Latte" },
      }),
      block("contact", {
        firstName: "Ana",
        lastName: "Ruiz",
        company: "Ruiz Design LLC",
        jobTitle: "Designer",
        phones: [
          {
            id: "p1",
            type: "mobile",
            number: "+1 415 555 0132",
            whatsapp: true,
          },
        ],
        emails: [{ id: "e1", type: "work", address: "ana@ruiz.studio" }],
        website: "https://ruiz.studio/about",
        address: {
          street: "88 Valencia St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94103",
          country: "USA",
        },
        photo: { url: UPLOAD, alt: "Ana" },
      }),
      block("socials", {
        items: [
          {
            id: "s1",
            network: "instagram",
            url: "https://instagram.com/ana.ruiz",
          },
        ],
      }),
      block("wifi", { ssid: "Ruiz Home 5G", password: "sunflower-1987" }),
      block("text", {
        heading: "Opening",
        body: "Open from 2026-11-05. Book at www.ruiz.studio/book or text 415-555-0199.",
      }),
      block("gallery", {
        images: [
          {
            id: "g1",
            source: { type: "file", fileId: FILE_ID, name: "me.jpg" },
            alt: "",
            caption: "",
          },
          {
            id: "g2",
            source: { type: "url", url: LIBRARY_PHOTO },
            alt: "Latte",
            caption: "",
          },
        ],
      }),
      block("pdf", {
        source: { type: "file", fileId: FILE_ID, name: "price-list.pdf" },
        title: "Price list",
      }),
      block("coupon", {
        headline: "10% off",
        code: "ANA10",
        barcode: "ean13",
        barcodeValue: "4006381333931",
      }),
      block("button", { label: "Email me", url: "mailto:ana@ruiz.studio" }),
      block("text", { body: "Secret draft" }, { hidden: true }),
      block("page-settings", {
        description: "Ana's page",
        shareImage: { url: UPLOAD, alt: "" },
      }),
    ],
  };
  const valid = parseLandingPageContent(content, { mode: "write" });
  if (!valid.success) {
    throw new Error(
      `fixture is invalid: ${JSON.stringify(valid.error.issues)}`,
    );
  }
  return valid.data;
}

/** Links a scrubbed page may still hold: samples, neutral ones, the library. */
function strayLinks(content: unknown): string[] {
  const json = JSON.stringify(content);
  const links = json.match(/https?:\/\/[^"\s)]+/g) ?? [];
  return links.filter(
    (link) =>
      !link.startsWith(SAMPLE_LINK) &&
      !isLibraryMedia(link) &&
      link !== "https://apps.apple.com/" &&
      link !== "https://play.google.com/store/apps" &&
      !link.startsWith("https://www.youtube.com/watch?v="),
  );
}

const strayEmails = (content: unknown) =>
  (JSON.stringify(content).match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).filter(
    (email) => email !== SAMPLE_EMAIL,
  );

describe("scrubPageContent", () => {
  it("takes every kind of personal detail out of a real page", () => {
    const { content, report } = scrubPageContent(personalPage());
    const json = JSON.stringify(content);

    for (const secret of [
      "Ruiz Design",
      '"Ana"',
      '"Ruiz"',
      "ana.ruiz@gmail.com",
      "ana@ruiz.studio",
      "415 555 0132",
      "415-555-0199",
      "ruiz.studio",
      "instagram.com/ana",
      "Valencia",
      "94103",
      "Ruiz Home 5G",
      "sunflower-1987",
      "files.qrdx.dev",
      FILE_ID,
      "Secret draft",
      "Ana's page",
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(strayLinks(content)).toEqual([]);
    expect(strayEmails(content)).toEqual([]);

    // Samples in their place, so the template still reads like a page.
    expect(json).toContain(SAMPLE_EMAIL);
    expect(json).toContain(SAMPLE_PHONE);
    expect(json).toContain("123 Main Street");
    expect(json).toContain("Guest Wi-Fi");
    // Text the person wrote stays as written (they review it before
    // publishing), apart from the contact details inside it.
    expect(json).toContain("Ana Ruiz Studio");
    // What isn't personal stays: the coupon's barcode, dates, the library photo.
    expect(json).toContain("4006381333931");
    expect(json).toContain("2026-11-05");
    expect(json).toContain(LIBRARY_PHOTO);
    // No settings or hidden blocks, no theme upload.
    expect(content.blocks.map((b) => b.type)).not.toContain("page-settings");
    expect(content.theme.background).toEqual({ type: "solid" });
    expect(content.theme.logo).toBeUndefined();
    // The gallery keeps the library photo only; the PDF loses its file.
    const gallery = content.blocks.find((b) => b.type === "gallery");
    expect(gallery?.props.images).toHaveLength(1);
    const pdf = content.blocks.find((b) => b.type === "pdf");
    expect(pdf?.props.source).toBeNull();

    // It still saves like a page.
    expect(parseLandingPageContent(content, { mode: "write" }).success).toBe(
      true,
    );
    expect(report).toMatchObject({
      settings: true,
      hidden: 1,
      wifi: 2,
      names: 3,
      addresses: 1,
      files: 1,
    });
    expect(report.images).toBeGreaterThanOrEqual(4);
    expect(report.emails).toBeGreaterThanOrEqual(3);
    expect(report.phones).toBeGreaterThanOrEqual(3);
    expect(report.links).toBeGreaterThanOrEqual(3);
    const summary = scrubSummary(report);
    expect(summary.join("\n")).toMatch(/replaced with example\.com/);
    expect(summary.join("\n")).toMatch(/Wi-Fi network name and password/);
    expect(summary.join("\n")).toMatch(
      /Share image, description and custom CSS/,
    );
  });

  it("keeps every built-in template valid and leaves nothing personal in it", () => {
    let variants = 0;
    for (const template of listTemplates()) {
      for (const variant of template.variants) {
        variants++;
        const source = buildTemplateContent(template.type, variant.id);
        const { content, report } = scrubPageContent(source);
        const parsed = parseLandingPageContent(content, { mode: "write" });
        expect(
          parsed.success,
          `${template.type}/${variant.id} no longer saves`,
        ).toBe(true);
        expect(strayLinks(content), `${template.type}/${variant.id}`).toEqual(
          [],
        );
        expect(strayEmails(content), `${template.type}/${variant.id}`).toEqual(
          [],
        );
        // Built-in templates hold only blocks that work without uploads.
        expect(report.blocks, `${template.type}/${variant.id}`).toEqual([]);
      }
    }
    expect(variants).toBeGreaterThan(20);
  });

  it("refuses look-alike library links", () => {
    expect(isLibraryMedia(LIBRARY_PHOTO)).toBe(true);
    expect(
      isLibraryMedia("https://qrdx.dev/images/templates/hero-latte.webp"),
    ).toBe(true);
    expect(
      isLibraryMedia("https://evil.dev/images/templates/hero-latte.webp"),
    ).toBe(false);
    expect(
      isLibraryMedia("https://qrdx.dev/images/templates/../avatars/me.webp"),
    ).toBe(false);
    expect(isLibraryMedia("https://qrdx.dev/images/templates/x.webp?u=1")).toBe(
      false,
    );
    expect(isLibraryMedia("https://qrdx.dev/images/templates/x.png")).toBe(
      false,
    );
  });
});

function person(id: string) {
  return {
    id,
    name: id.replace("u_", ""),
    email: `${id}@example.com`,
    image: null,
    banned: false,
    banExpires: null,
  };
}

function page(id: string, organizationId: string, userId = "u_ana") {
  return {
    id,
    userId,
    organizationId,
    type: "vcard",
    title: "Ana's card",
    content: personalPage(),
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  fakeDb.resetAll();
  state.userId = "u_ana";
  state.scope = { userId: "u_ana", organizationId: OWN, role: "owner" };
  state.plan = "free";
  fakeDb.unique("communityProfile", "handle");
  fakeDb.unique("communityItem", "type", "slug");
  fakeDb.unique("communityUse", "itemId", "userId", "kind", "day");
  fakeDb.defaults("communityProfile", {
    handle: null,
    bio: null,
    avatarUrl: null,
    verifiedAt: null,
    status: "active",
    workspaceId: null,
  });
  fakeDb.defaults("communityItem", {
    likeCount: 0,
    saveCount: 0,
    useCount: 0,
    remixCount: 0,
    featuredAt: null,
    remixedFromLabel: null,
    removedAt: null,
  });
  fakeDb.seed("user", [person("u_ana"), person("u_bob"), person("u_cy")]);
  fakeDb.seed("landingPage", [
    page("pg_mine", OWN),
    page("pg_team", TEAM, "u_bob"),
    page("pg_other", "org_other", "u_cy"),
  ]);
});

const details = {
  name: "Studio card",
  description: "A contact page for a small studio.",
  tags: ["contact", "minimal", "not-a-tag"],
  acceptLicense: true,
};

describe("previewCommunityPage and publishCommunityPage", () => {
  it("shows the scrubbed page, then publishes it from the database", async () => {
    const preview = await previewCommunityPage("pg_mine");
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(JSON.stringify(preview.data.content)).not.toContain(
      "ana@ruiz.studio",
    );
    expect(preview.data.changes.length).toBeGreaterThan(3);
    // Previewing stores nothing.
    expect(fakeDb.rows("communityItem")).toHaveLength(0);

    const result = await publishCommunityPage({
      pageId: "pg_mine",
      ...details,
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        href: expect.stringMatching(/^\/community\/templates\/studio-card-/),
      },
    });
    const [item] = fakeDb.rows("communityItem");
    expect(item).toMatchObject({
      type: "page-template",
      status: "published",
      createdBy: "u_ana",
      sourceKind: "landing_page",
      sourceId: "pg_mine",
      facets: { pageType: "vcard" },
      scanScore: null,
    });
    const stored = JSON.stringify(item?.payload);
    expect(strayLinks(item?.payload)).toEqual([]);
    expect(strayEmails(item?.payload)).toEqual([]);
    expect(stored).not.toContain("Ruiz Home 5G");
    expect(readPageTemplate(item?.payload, "write")).not.toBeNull();
    expect(
      fakeDb
        .rows("communityItemTag")
        .map((row) => row.tag)
        .sort(),
    ).toEqual(["contact", "minimal"]);
    // The page itself is untouched.
    expect(
      JSON.stringify(fakeDb.find("landingPage", { id: "pg_mine" })?.content),
    ).toContain("ana@ruiz.studio");

    // Readable as an item and through the API, with no QR style.
    const slug = String(item?.slug);
    const detail = await getItem("page-template", slug, null);
    expect(detail?.page?.type).toBe("vcard");
    const api = await getCommunityItem(`page-template:${slug}`);
    expect(api).toMatchObject({
      type: "page-template",
      style: null,
      pageType: "vcard",
    });
    expect(JSON.stringify(api)).not.toContain("123 Main Street");
  });

  it("lets owners and admins of a shared workspace publish, and nobody else", async () => {
    state.scope = { userId: "u_ana", organizationId: TEAM, role: "member" };
    expect(
      await publishCommunityPage({ pageId: "pg_team", ...details }),
    ).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message:
        "Only owners and admins of this workspace can publish what's in it.",
    });
    expect(await previewCommunityPage("pg_team")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });

    state.scope = { userId: "u_ana", organizationId: TEAM, role: "admin" };
    // Another workspace's page looks like a missing one.
    expect(
      await publishCommunityPage({ pageId: "pg_other", ...details }),
    ).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(fakeDb.rows("communityItem")).toHaveLength(0);

    expect(
      (await publishCommunityPage({ pageId: "pg_team", ...details })).ok,
    ).toBe(true);
    expect(fakeDb.rows("communityItem")[0]).toMatchObject({
      createdBy: "u_ana",
    });
  });

  it("needs the licence and clean text, and refuses a duplicate", async () => {
    expect(
      await publishCommunityPage({
        pageId: "pg_mine",
        ...details,
        acceptLicense: false,
      }),
    ).toMatchObject({ ok: false, code: "LICENSE_REQUIRED" });
    expect(
      await publishCommunityPage({
        pageId: "pg_mine",
        ...details,
        description: "Write to ana@ruiz.studio",
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      (await publishCommunityPage({ pageId: "pg_mine", ...details })).ok,
    ).toBe(true);
    expect(
      await publishCommunityPage({
        pageId: "pg_mine",
        ...details,
        name: "Again",
      }),
    ).toMatchObject({
      ok: false,
      code: "ALREADY_PUBLISHED",
      href: expect.stringMatching(/^\/community\/templates\//),
    });
    state.userId = null;
    expect(
      await publishCommunityPage({ pageId: "pg_mine", ...details }),
    ).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });
});

describe("copyCommunityTemplate", () => {
  async function publishOne() {
    const result = await publishCommunityPage({
      pageId: "pg_mine",
      ...details,
    });
    if (!result.ok) throw new Error(result.message);
    return result.data.href.split("/").at(-1) as string;
  }

  it("copies the template into the open workspace as a draft page with no code", async () => {
    const slug = await publishOne();
    state.userId = "u_bob";
    state.scope = { userId: "u_bob", organizationId: TEAM, role: "member" };

    const result = await copyCommunityTemplate({ slug });
    expect(result).toMatchObject({ ok: true, data: { name: "Studio card" } });
    if (!result.ok) return;
    const copy = fakeDb.find("landingPage", { id: result.data.pageId });
    expect(copy).toMatchObject({
      userId: "u_bob",
      organizationId: TEAM,
      type: "vcard",
      title: "Studio card",
      version: 1,
    });
    expect(strayEmails(copy?.content)).toEqual([]);
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
    expect(
      fakeDb
        .rows("landingPageVersion")
        .filter((row) => row.pageId === result.data.pageId),
    ).toHaveLength(1);
    // Counted as a use, once a day.
    await copyCommunityTemplate({ slug });
    expect(fakeDb.rows("communityUse")).toHaveLength(1);
    expect(fakeDb.rows("communityItem")[0]?.useCount).toBe(1);
  });

  it("keeps to the plan's page limit and refuses viewers", async () => {
    const slug = await publishOne();
    // Free: 3 pages, and the workspace already holds 1 (pg_mine).
    fakeDb.seed("landingPage", [page("pg_2", OWN), page("pg_3", OWN)]);
    expect(await copyCommunityTemplate({ slug })).toMatchObject({
      ok: false,
      code: "PAGE_LIMIT_REACHED",
    });
    expect(fakeDb.rows("landingPage")).toHaveLength(5);

    state.scope = { userId: "u_ana", organizationId: TEAM, role: "viewer" };
    expect(await copyCommunityTemplate({ slug })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await copyCommunityTemplate({ slug: "no-such-template" }),
    ).toMatchObject({
      ok: false,
    });
  });
});

describe("the admin review queue", () => {
  it("lists members' items as they go live, newest first, by type", async () => {
    expect(
      (await publishCommunityPage({ pageId: "pg_mine", ...details })).ok,
    ).toBe(true);
    const all = await itemsForReview({ limit: 25, offset: 0 });
    expect(all.total).toBe(1);
    expect(all.rows[0]).toMatchObject({
      type: "page-template",
      name: "Studio card",
      createdBy: "u_ana",
    });
    expect(
      await itemsForReview({ type: "frame", limit: 25, offset: 0 }),
    ).toEqual({ rows: [], total: 0 });
  });
});
