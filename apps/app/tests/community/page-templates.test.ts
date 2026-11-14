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
  /** Daily publish limit checks (each one counts a publish) */
  limitCalls: 0,
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
  createRateLimiter: () => ({
    limit: async () => {
      state.limitCalls++;
      return { success: true };
    },
  }),
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
  unpublishCommunityItem,
} from "@/actions/community";
import { getCommunityItem } from "@/lib/community/api";
import {
  readPageTemplate,
  SAMPLE_EMAIL,
  SAMPLE_LINK,
  SAMPLE_PHONE,
  scrubPageContent,
  scrubSummary,
} from "@/lib/community/page-template";
import { getItem, itemsForReview } from "@/lib/community/queries";
import {
  createBlock,
  getBlock,
  parseLandingPageContent,
} from "@/lib/landing/blocks";
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
    // Text the person wrote is replaced too unless they keep it (fail-closed).
    expect(json).not.toContain("Ana Ruiz Studio");
    expect(json).not.toContain("Opening");
    expect(json).toContain("Your name");
    // What isn't personal stays: the coupon's barcode and dates. Photos
    // don't, QRdx's library included.
    expect(json).not.toContain("4006381333931");
    expect(json).not.toContain("ANA10");
    const coupon = content.blocks.find((b) => b.type === "coupon")?.props;
    expect(coupon).toMatchObject({
      code: "SAVE10",
      barcode: "code128",
      barcodeValue: "",
    });
    // The text around the date was free text: replaced as a whole.
    expect(json).not.toContain("Book at");
    expect(json).toContain("A few words about this.");
    expect(json).not.toContain(LIBRARY_PHOTO);
    expect(json).not.toContain("/images/templates/");
    // No settings or hidden blocks, no theme upload.
    expect(content.blocks.map((b) => b.type)).not.toContain("page-settings");
    expect(content.theme.background).toEqual({ type: "solid" });
    expect(content.theme.logo).toBeUndefined();
    // The gallery is left empty to fill in; the PDF loses its file.
    const gallery = content.blocks.find((b) => b.type === "gallery");
    expect(gallery?.props.images).toEqual([]);
    // The PDF without its file is left out.
    expect(content.blocks.map((b) => b.type)).not.toContain("pdf");

    // It still saves like a page.
    expect(parseLandingPageContent(content, { mode: "write" }).success).toBe(
      true,
    );
    expect(report).toMatchObject({
      settings: true,
      hidden: 1,
      wifi: 2,
      codes: 2,
      addresses: 1,
      files: 1,
    });
    expect(report.images).toBeGreaterThanOrEqual(4);
    // Emails and phones inside free text go with the whole text.
    expect(report.emails).toBeGreaterThanOrEqual(2);
    expect(report.phones).toBeGreaterThanOrEqual(1);
    expect(report.texts).toBeGreaterThanOrEqual(5);
    expect(report.links).toBeGreaterThanOrEqual(2);
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
        expect(
          JSON.stringify(content),
          `${template.type}/${variant.id} keeps an image`,
        ).not.toMatch(
          /\.(?:webp|png|jpe?g|gif|svg|avif)\b|\/images\/templates\//i,
        );
        // Only blocks that needed their file are left out.
        const fileBlocks = ["pdf", "video-file", "audio", "file-download"].map(
          (type) => getBlock(type)?.label,
        );
        for (const label of report.blocks) {
          expect(fileBlocks, `${template.type}/${variant.id}`).toContain(label);
        }
      }
    }
    expect(variants).toBeGreaterThan(20);
  });

  it("leaves no image of any kind: uploads, QRdx's library, backgrounds, share images, covers, posters", () => {
    const upload = (name: string) => ({
      type: "file",
      fileId: FILE_ID,
      name,
    });
    const library = (name: string) => templateMediaUrl(name);
    const source: LandingPageContent = {
      version: 1,
      theme: {
        ...DEFAULT_LANDING_THEME,
        background: {
          type: "image",
          url: library("banner-cafe-tables.webp"),
          overlay: 0.3,
        },
        logo: { url: library("logo-brewly.svg"), alt: "Logo" },
      },
      blocks: [
        block("header", {
          title: "Café",
          avatar: { url: library("logo-brewly.svg"), alt: "" },
          cover: { url: library("hero-latte.webp"), alt: "" },
        }),
        block("image", { image: { url: UPLOAD, alt: "Front" } }),
        block("links", {
          items: [
            {
              id: "l1",
              label: "Menu",
              url: "https://example.com/menu",
              thumbnail: { url: library("tile-alpine.webp"), alt: "" },
              featured: false,
            },
          ],
        }),
        block("gallery", {
          images: [
            { id: "g1", source: upload("a.jpg"), alt: "", caption: "" },
            {
              id: "g2",
              source: { type: "url", url: library("photo-meadow.webp") },
              alt: "",
              caption: "",
            },
          ],
        }),
        block("video-file", {
          source: { type: "url", url: "https://cdn.example.org/v.mp4" },
          poster: { type: "url", url: library("cover-shop.webp") },
        }),
        block("audio", {
          tracks: [
            {
              id: "a1",
              title: "Intro",
              source: { type: "url", url: "https://cdn.example.org/a.mp3" },
            },
          ],
          cover: upload("cover.png"),
        }),
        block("page-settings", {
          shareImage: { url: library("hero-latte.webp"), alt: "" },
        }),
      ],
    };
    const valid = parseLandingPageContent(source, { mode: "write" });
    if (!valid.success) {
      throw new Error(
        `fixture is invalid: ${JSON.stringify(valid.error.issues)}`,
      );
    }
    const { content, report } = scrubPageContent(valid.data);
    const json = JSON.stringify(content);

    // No image URL, no upload, no library path, anywhere.
    expect(json).not.toMatch(/\.(?:webp|png|jpe?g|gif|svg|avif)\b/i);
    expect(json).not.toContain("/images/templates/");
    expect(json).not.toContain("fileId");
    expect(json).not.toContain("cdn.example.org");
    expect(content.theme.background).toEqual({ type: "solid" });
    expect(content.theme.logo).toBeUndefined();
    const props = (type: string) =>
      content.blocks.find((b) => b.type === type)?.props as
        | Record<string, unknown>
        | undefined;
    // Each slot is left empty to fill in after Use template.
    expect(props("header")?.avatar).toBeUndefined();
    expect(props("header")?.cover).toBeUndefined();
    expect(props("image")?.image).toBeUndefined();
    expect(
      (props("links")?.items as { thumbnail?: unknown }[] | undefined)?.[0]
        ?.thumbnail,
    ).toBeUndefined();
    expect(props("gallery")?.images).toEqual([]);
    // A video without its file is left out, poster and all.
    expect(props("video-file")).toBeUndefined();
    // Audio without its tracks is left out too.
    expect(props("audio")).toBeUndefined();
    expect(content.blocks.map((b) => b.type)).not.toContain("page-settings");
    expect(report.images).toBeGreaterThanOrEqual(8);
    expect(scrubSummary(report).join("\n")).toMatch(
      /photos removed: people add their own/,
    );
    expect(parseLandingPageContent(content, { mode: "write" }).success).toBe(
      true,
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
  state.limitCalls = 0;
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
  version: 1,
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
    // One counted use; the second copy keeps its own lineage row.
    const uses = fakeDb.rows("communityUse");
    expect(uses.filter((row) => row.kind === "copy")).toHaveLength(1);
    expect(
      uses.filter((row) => String(row.kind).startsWith("lineage:")),
    ).toHaveLength(1);
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

// Review fixes B, E and H: a neutral default name, what's published is
// what was reviewed, kept text is checked, and a refused publish never uses
// up the daily limit.
describe("publishing what was reviewed", () => {
  it("names the template after its page type, never the page's own title", async () => {
    const preview = await previewCommunityPage("pg_mine");
    expect(preview).toMatchObject({
      ok: true,
      data: { defaultName: "vCard Plus", version: 1 },
    });
    if (!preview.ok) return;
    expect(JSON.stringify(preview.data)).not.toContain("Ana's card");
    expect(
      await publishCommunityPage({
        pageId: "pg_mine",
        ...details,
        name: "Ana Ruiz, call 5550132",
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("refuses a page that changed since it was reviewed", async () => {
    const row = fakeDb.find("landingPage", { id: "pg_mine" });
    if (row) row.version = 2;
    expect(
      await publishCommunityPage({ pageId: "pg_mine", ...details, version: 1 }),
    ).toEqual({
      ok: false,
      code: "CONFLICT",
      message:
        "This page changed since you reviewed it. Review it again before publishing.",
    });
    expect(fakeDb.rows("communityItem")).toHaveLength(0);
    expect(
      (
        await publishCommunityPage({
          pageId: "pg_mine",
          ...details,
          version: 2,
        })
      ).ok,
    ).toBe(true);
  });

  it("publishes kept text, and refuses kept text with contact details", async () => {
    const preview = await previewCommunityPage("pg_mine");
    if (!preview.ok) throw new Error(preview.message);
    const title = preview.data.fields.find(
      (field) => field.original === "Ana Ruiz Studio",
    );
    const subtitle = preview.data.fields.find((field) =>
      field.original.includes("ana.ruiz@gmail.com"),
    );
    expect(title && subtitle).toBeTruthy();
    expect(
      await publishCommunityPage({
        pageId: "pg_mine",
        ...details,
        keep: [String(subtitle?.id)],
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(fakeDb.rows("communityItem")).toHaveLength(0);

    expect(
      (
        await publishCommunityPage({
          pageId: "pg_mine",
          ...details,
          keep: [String(title?.id)],
        })
      ).ok,
    ).toBe(true);
    const stored = JSON.stringify(fakeDb.rows("communityItem")[0]?.payload);
    expect(stored).toContain("Ana Ruiz Studio");
    expect(stored).not.toContain("ana.ruiz@gmail.com");
  });

  it("counts the daily limit only once every check has passed", async () => {
    await publishCommunityPage({
      pageId: "pg_mine",
      ...details,
      acceptLicense: false,
    });
    await publishCommunityPage({ pageId: "pg_mine", ...details, version: 9 });
    await publishCommunityPage({
      pageId: "pg_mine",
      ...details,
      description: "ana@ruiz.studio",
    });
    expect(state.limitCalls).toBe(0);
    expect(
      (await publishCommunityPage({ pageId: "pg_mine", ...details })).ok,
    ).toBe(true);
    expect(state.limitCalls).toBe(1);
    // A duplicate is refused before the limit too.
    await publishCommunityPage({
      pageId: "pg_mine",
      ...details,
      name: "Again",
    });
    expect(state.limitCalls).toBe(1);
  });
});

// Review H: a template an admin publishes from a shared workspace can be
// unpublished by that workspace's owners and admins too (it stays on the
// admin's profile), never by its members or by other workspaces.
describe("unpublishing a workspace's template", () => {
  it("lets the workspace owner unpublish what an admin published", async () => {
    fakeDb.seed("member", [
      {
        id: "m1",
        userId: "u_bob",
        organizationId: TEAM,
        role: "owner",
        createdAt: NOW,
      },
      {
        id: "m2",
        userId: "u_cy",
        organizationId: TEAM,
        role: "member",
        createdAt: NOW,
      },
      {
        id: "m3",
        userId: "u_ana",
        organizationId: TEAM,
        role: "admin",
        createdAt: NOW,
      },
    ]);
    state.scope = { userId: "u_ana", organizationId: TEAM, role: "admin" };
    expect(
      (await publishCommunityPage({ pageId: "pg_team", ...details })).ok,
    ).toBe(true);
    const item = fakeDb.rows("communityItem")[0];

    state.userId = "u_cy";
    expect(await unpublishCommunityItem(String(item?.id))).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    state.userId = "u_bob";
    expect(await unpublishCommunityItem(String(item?.id))).toEqual({
      ok: true,
      data: { removed: true },
    });
    expect(fakeDb.find("communityItem", { id: item?.id })).toMatchObject({
      status: "removed",
      removedReason: "workspace",
      createdBy: "u_ana",
    });
  });
});
