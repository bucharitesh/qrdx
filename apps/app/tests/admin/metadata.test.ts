// Admin page titles reach admins only. The admin layout's requireAdmin()
// answers everyone else with a 404, but Next resolves a page's metadata next
// to the layout, not after it, and streams the result into the 404's page
// data. A static `metadata` title on an admin page was therefore readable by
// anyone who opened /admin/... (for example "Admin · Health" in the HTML and
// the RSC payload). Each admin page now resolves its title in
// generateMetadata, after the admin check, so for a visitor it throws the
// same 404 as the page and Next falls back to the site's "Page not found".
//
// Every page under app/(app)/admin is found on disk, so a new one is checked too.
// The guard is mocked; nothing touches a database or a service.
import { readdirSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: null as null | { id: string; email: string; name: string },
}));

vi.mock("@/app/(app)/admin/_lib/guard", () => ({
  getAdminUser: vi.fn(async () => state.admin),
  requireAdmin: vi.fn(async () => {
    if (!state.admin) notFound();
    return state.admin;
  }),
  assertAdmin: vi.fn(async () => {
    if (!state.admin) throw new Error("Not found");
    return state.admin;
  }),
}));

const ADMIN = { id: "u_admin", email: "admin@example.com", name: "Admin" };
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

// What an admin sees in the tab, per page.
const TITLES: Record<string, string> = {
  "page.tsx": "Admin · Overview",
  "abuse/page.tsx": "Admin · Abuse reports",
  "affiliates/page.tsx": "Admin · Affiliates",
  "affiliates/[affiliateId]/page.tsx": "Admin · Affiliate",
  "ai-usage/page.tsx": "Admin · AI Usage",
  "audit-log/page.tsx": "Admin · Audit Log",
  "codes/page.tsx": "Admin · QR Codes",
  "community/page.tsx": "Admin · Community",
  "confirm/page.tsx": "Admin · Confirm it's you",
  "growth/page.tsx": "Admin · Growth",
  "health/page.tsx": "Admin · Health",
  "integrations/page.tsx": "Admin · Integrations",
  "numbers/page.tsx": "Admin · Home page numbers",
  "search/page.tsx": "Admin · Search",
  "subscriptions/page.tsx": "Admin · Subscriptions",
  "themes/page.tsx": "Admin · Themes",
  "users/page.tsx": "Admin · Users",
  "users/[userId]/page.tsx": "Admin · User",
};

const adminDir = path.resolve(import.meta.dirname, "../../app/(app)/admin");
const pages = (readdirSync(adminDir, { recursive: true }) as string[])
  .map((file) => file.split(path.sep).join("/"))
  .filter((file) => file === "page.tsx" || file.endsWith("/page.tsx"))
  .sort();

interface MetadataModule {
  metadata?: Record<string, unknown>;
  generateMetadata?: (props: unknown, parent: unknown) => unknown;
}

const load = (file: string) =>
  import(`../../app/(app)/admin/${file}`) as Promise<MetadataModule>;

const props = {
  params: Promise.resolve({ userId: "u_123" }),
  searchParams: Promise.resolve({}),
};

/** The metadata Next resolves for this segment on the current request. */
async function resolveMetadata(mod: MetadataModule) {
  const generated =
    typeof mod.generateMetadata === "function"
      ? await mod.generateMetadata(props, Promise.resolve({}))
      : {};
  return { ...mod.metadata, ...(generated as Record<string, unknown>) };
}

const titleOf = (metadata: Record<string, unknown>) => {
  const title = metadata.title;
  if (typeof title === "string") return title;
  if (title && typeof title === "object") {
    const { absolute, default: fallback } = title as {
      absolute?: string;
      default?: string;
    };
    return absolute ?? fallback;
  }
  return undefined;
};

describe("admin page metadata", () => {
  it("covers every admin page", () => {
    expect(pages).toEqual(Object.keys(TITLES).sort());
  });

  it("puts no title or name in the admin layout's metadata", async () => {
    const layout = (await import(
      "@/app/(app)/admin/layout"
    )) as unknown as MetadataModule;
    expect(layout.generateMetadata).toBeUndefined();
    expect(layout.metadata?.title).toBeUndefined();
    expect(JSON.stringify(layout.metadata ?? {})).not.toMatch(/admin/i);
    // Still kept out of search results, for admins too.
    expect(layout.metadata?.robots).toEqual({ index: false, follow: false });
  });

  describe.each(pages)("%s", (file) => {
    it("gives a visitor a 404 and no admin title", async () => {
      state.admin = null;
      const mod = await load(file);
      // Nothing static: Next would resolve it without the admin check.
      expect(JSON.stringify(mod.metadata ?? {})).not.toContain("Admin");
      await expect(resolveMetadata(mod)).rejects.toMatchObject({
        digest: NOT_FOUND,
      });
    });

    it("gives an admin the page's title", async () => {
      state.admin = ADMIN;
      const mod = await load(file);
      expect(titleOf(await resolveMetadata(mod))).toBe(TITLES[file]);
    });
  });
});
