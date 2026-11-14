// A hosted page made from the playground gets its QR design (an owner
// decision): createLandingPage takes the design, checked like a code's, and
// the page's code is created with it. Without one, the workspace's default
// theme applies as before. Runs the real pages and codes services against
// in-memory tables (tests/support/fake-db.ts); nothing reaches a database.
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
const DEFAULT_THEME = { fgColor: "#222222", bgColor: "#ffffff" };
vi.mock("@/app/(app)/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => DEFAULT_THEME,
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { createPage, createPageSchema } = await import(
  "@/app/(app)/dashboard/pages/_lib/landing-pages"
);
const { defaultThemeState } = await import("@/config/qr");

const SCOPE = {
  userId: "u_alice",
  organizationId: ownWorkspaceId("u_alice"),
  role: "owner" as const,
};

const PLAYGROUND_STYLE = {
  ...defaultThemeState.styles,
  fgColor: "#123456",
  bodyPattern: "diamond" as const,
};

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    contentType: "url",
    style: null,
    title: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.seed("user", [{ id: "u_alice", banned: false, banExpires: null }]);
});

const pageCode = () => {
  const rows = fakeDb.rows("qrCode");
  expect(rows).toHaveLength(1);
  return rows[0] as { style: unknown; pageId: string | null };
};

describe("a hosted page's code design", () => {
  it("is the design it was created with", async () => {
    const { pageId, codeId } = await createPage(
      SCOPE,
      createPageSchema.parse({ type: "menu", style: PLAYGROUND_STYLE }),
    );
    const code = pageCode();
    expect(code).toMatchObject({ id: codeId, pageId });
    expect(code.style).toEqual(PLAYGROUND_STYLE);
  });

  it("is the workspace's default theme without one, as before", async () => {
    await createPage(SCOPE, createPageSchema.parse({ type: "menu" }));
    expect(pageCode().style).toEqual(
      expect.objectContaining({ fgColor: DEFAULT_THEME.fgColor }),
    );
  });

  it("is checked like a code's design", () => {
    expect(
      createPageSchema.safeParse({
        type: "menu",
        // Over the codes' 1,500,000-character design cap (qr-codes.ts).
        style: { customLogo: "x".repeat(1_600_000) },
      }).success,
    ).toBe(false);
    expect(
      createPageSchema.safeParse({ type: "menu", style: { fgColor: 42 } })
        .success,
    ).toBe(false);
  });
});
