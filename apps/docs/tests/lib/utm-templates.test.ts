// Saved UTM templates (lib/utm-templates.ts): scoped to the workspace, behind
// the UTM plan limit (`routing`, Pro), names unique per workspace, only the
// creator or an owner/admin renames and deletes, and before manual-sql/0013
// every read says "unavailable" instead of failing. In-memory tables
// (tests/support/fake-db); nothing touches a database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, repoDatabase } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));

const {
  createUtmTemplate,
  deleteUtmTemplate,
  listUtmTemplates,
  renameUtmTemplate,
  UtmTemplatesUnavailableError,
} = await import("@/lib/utm-templates");
const { isEmptyUtm, utmSummary, MAX_UTM_TEMPLATES } = await import(
  "@/lib/utm-templates-shared"
);

const owner = {
  userId: "u_alice",
  organizationId: "org_acme",
  role: "owner" as const,
};
const member = {
  userId: "u_bob",
  organizationId: "org_acme",
  role: "member" as const,
};
const otherMember = {
  userId: "u_dan",
  organizationId: "org_acme",
  role: "member" as const,
};
const elsewhere = {
  userId: "u_carol",
  organizationId: "org_other",
  role: "owner" as const,
};

const SPRING = { source: "qr", medium: "print", campaign: "spring-sale" };

beforeEach(() => {
  fakeDb.resetAll();
  state.plan = "pro";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saved UTM templates", () => {
  it("saves the panel's values under a name and lists them by name, per workspace", async () => {
    await createUtmTemplate(owner, { name: "Spring posters", utm: SPRING });
    await createUtmTemplate(member, {
      name: "autumn flyers",
      utm: {
        source: "qr",
        medium: "flyer",
        params: [{ key: "ref", value: "a1" }],
      },
    });
    await createUtmTemplate(elsewhere, { name: "Theirs", utm: SPRING });

    const list = await listUtmTemplates(owner);
    expect(list.available).toBe(true);
    expect(list.allowed).toBe(true);
    expect(list.templates.map((t) => t.name)).toEqual([
      "autumn flyers",
      "Spring posters",
    ]);
    expect(list.templates[1]?.utm).toMatchObject(SPRING);
    // Rows carry the workspace, never just the person.
    expect(fakeDb.rows("utmTemplate").every((row) => row.organizationId)).toBe(
      true,
    );
  });

  it("needs a plan with UTM parameters to save or rename, but not to delete", async () => {
    const saved = await createUtmTemplate(owner, {
      name: "Spring",
      utm: SPRING,
    });
    state.plan = "free";
    await expect(
      createUtmTemplate(owner, { name: "More", utm: SPRING }),
    ).rejects.toMatchObject({ status: 402, code: "PLAN_REQUIRED" });
    await expect(
      renameUtmTemplate(owner, { id: saved.id, name: "Renamed" }),
    ).rejects.toMatchObject({ code: "PLAN_REQUIRED" });
    expect((await listUtmTemplates(owner)).allowed).toBe(false);
    await expect(deleteUtmTemplate(owner, { id: saved.id })).resolves.toEqual({
      id: saved.id,
    });
  });

  it("refuses empty templates, duplicate names (any case) and more than the cap", async () => {
    await expect(
      createUtmTemplate(owner, { name: "Empty", utm: { params: [] } }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await createUtmTemplate(owner, { name: "Spring", utm: SPRING });
    await expect(
      createUtmTemplate(member, { name: "  spring ", utm: SPRING }),
    ).rejects.toMatchObject({ status: 409, code: "NAME_TAKEN" });
    // Another workspace may use the same name.
    await expect(
      createUtmTemplate(elsewhere, { name: "Spring", utm: SPRING }),
    ).resolves.toMatchObject({ name: "Spring" });

    fakeDb.seed(
      "utmTemplate",
      Array.from({ length: MAX_UTM_TEMPLATES - 1 }, (_, i) => ({
        id: `t_${i}`,
        userId: "u_alice",
        organizationId: "org_acme",
        name: `Template ${i}`,
        utm: SPRING,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    await expect(
      createUtmTemplate(owner, { name: "One too many", utm: SPRING }),
    ).rejects.toMatchObject({ code: "TOO_MANY_TEMPLATES" });
  });

  it("checks parameters with the same rules as a code's UTM", async () => {
    await expect(
      createUtmTemplate(owner, {
        name: "Bad",
        utm: { source: "qr", params: [{ key: "qrdx_sid", value: "x" }] },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("lets the creator and owners or admins rename and delete, not other members", async () => {
    const mine = await createUtmTemplate(member, {
      name: "Bob's",
      utm: SPRING,
    });
    const listed = await listUtmTemplates(otherMember);
    expect(listed.templates[0]?.canEdit).toBe(false);
    expect((await listUtmTemplates(member)).templates[0]?.canEdit).toBe(true);
    expect((await listUtmTemplates(owner)).templates[0]?.canEdit).toBe(true);

    await expect(
      renameUtmTemplate(otherMember, { id: mine.id, name: "Mine now" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteUtmTemplate(otherMember, { id: mine.id }),
    ).rejects.toMatchObject({ status: 403 });

    const renamed = await renameUtmTemplate(owner, {
      id: mine.id,
      name: "Bob's spring",
    });
    expect(renamed.name).toBe("Bob's spring");
    await deleteUtmTemplate(member, { id: mine.id });
    expect(fakeDb.rows("utmTemplate")).toHaveLength(0);
  });

  it("treats another workspace's template as missing", async () => {
    const theirs = await createUtmTemplate(elsewhere, {
      name: "X",
      utm: SPRING,
    });
    await expect(
      deleteUtmTemplate(owner, { id: theirs.id }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      renameUtmTemplate(owner, { id: theirs.id, name: "Y" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("summarizes a template for the menu", () => {
    expect(
      utmSummary({
        source: "qr",
        medium: "print",
        campaign: undefined,
        term: undefined,
        content: undefined,
        params: [{ key: "ref", value: "a" }],
      }),
    ).toBe("qr · print · 1 more");
    expect(isEmptyUtm({ params: [] } as never)).toBe(true);
  });
});

describe("before the utm_template table exists", () => {
  beforeEach(() => {
    const missing = Object.assign(new Error("Failed query"), {
      cause: Object.assign(
        new Error('relation "utm_template" does not exist'),
        {
          code: "42P01",
        },
      ),
    });
    const database = repoDatabase.database as Record<string, () => unknown>;
    const fail = () => {
      throw missing;
    };
    for (const method of ["select", "insert", "update", "delete"]) {
      vi.spyOn(database, method as never).mockImplementation(fail as never);
    }
  });

  it("lists nothing and says so, and writes fail with UNAVAILABLE (never a 500)", async () => {
    await expect(listUtmTemplates(owner)).resolves.toEqual({
      available: false,
      allowed: true,
      templates: [],
    });
    await expect(
      createUtmTemplate(owner, { name: "Spring", utm: SPRING }),
    ).rejects.toBeInstanceOf(UtmTemplatesUnavailableError);
    await expect(deleteUtmTemplate(owner, { id: "t_1" })).rejects.toMatchObject(
      { status: 503, code: "UNAVAILABLE" },
    );
  });
});
