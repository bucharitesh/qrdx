// Publishing a product page stores its GTIN (landing_page.gtin) for GS1
// Digital Links, and a GTIN opens one page per custom domain: a second page
// with the same GTIN and a code on the same domain can't be published.
// Pages on QRdx's shared host never clash (GTINs don't resolve there).
// Runs the real pages service against in-memory tables.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "pro",
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { publishPage } = await import(
  "@/app/(app)/dashboard/pages/_lib/landing-pages"
);
const { buildTemplateContent } = await import("@/lib/landing/templates");

const SCOPE = {
  userId: "u_alice",
  organizationId: ownWorkspaceId("u_alice"),
  role: "owner" as const,
};
const GTIN = "09506000134352";

function page(id: string, gtin: string | null = null) {
  return {
    id,
    userId: "u_alice",
    organizationId: SCOPE.organizationId,
    type: "product",
    title: id === "page_a" ? "Honey" : "Jam",
    content: buildTemplateContent("product", "food"),
    version: 1,
    gtin,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function pageCode(id: string, pageId: string, domainId: string | null) {
  return {
    id,
    userId: "u_alice",
    organizationId: SCOPE.organizationId,
    slug: id,
    slugScope: "",
    kind: "page",
    pageId,
    domainId,
    deletedAt: null,
    createdAt: new Date(),
  };
}

/** The food template with `gtin` in its product block. */
function withGtin(gtin: string) {
  const content = buildTemplateContent("product", "food");
  return {
    ...content,
    blocks: content.blocks.map((block) =>
      block.type === "product"
        ? { ...block, props: { ...block.props, gtin } }
        : block,
    ),
  };
}

const publish = (id: string, content: unknown, baseVersion = 1) =>
  publishPage(SCOPE, { id, title: null, content, baseVersion });

const storedGtin = (id: string) =>
  (fakeDb.find("landingPage", { id }) as { gtin: string | null } | undefined)
    ?.gtin;

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("customDomain", [
    { id: "dom_brand", hostname: "go.brand.com", verified: true },
    { id: "dom_shop", hostname: "shop.brand.com", verified: true },
  ]);
});

describe("publishing a product page", () => {
  it("stores the GTIN in its 14-digit form, and clears it when removed", async () => {
    fakeDb.seed("landingPage", [page("page_a")]);
    await publish("page_a", withGtin(GTIN.slice(1)));
    expect(storedGtin("page_a")).toBe(GTIN);
    await publish("page_a", withGtin(""), 2);
    expect(storedGtin("page_a")).toBeNull();
  });

  it("refuses a GTIN another page uses on the same custom domain", async () => {
    fakeDb.seed("landingPage", [page("page_a", GTIN), page("page_b")]);
    fakeDb.seed("qrCode", [
      pageCode("code_a", "page_a", "dom_brand"),
      pageCode("code_b", "page_b", "dom_brand"),
    ]);
    await expect(publish("page_b", withGtin(GTIN))).rejects.toThrow(
      /"Honey" already uses GTIN 09506000134352 on go\.brand\.com/,
    );
    expect(storedGtin("page_b")).toBeNull();
  });

  it("allows the same GTIN on another domain or on the shared host", async () => {
    fakeDb.seed("landingPage", [
      page("page_a", GTIN),
      page("page_b"),
      page("page_c"),
    ]);
    fakeDb.seed("qrCode", [
      pageCode("code_a", "page_a", "dom_brand"),
      pageCode("code_b", "page_b", "dom_shop"),
      pageCode("code_c", "page_c", null),
    ]);
    await publish("page_b", withGtin(GTIN));
    await publish("page_c", withGtin(GTIN));
    expect(storedGtin("page_b")).toBe(GTIN);
    expect(storedGtin("page_c")).toBe(GTIN);
  });

  it("rejects a GTIN with a wrong check digit", async () => {
    fakeDb.seed("landingPage", [page("page_a")]);
    await expect(publish("page_a", withGtin("09506000134353"))).rejects.toThrow(
      /check digit/,
    );
  });
});
