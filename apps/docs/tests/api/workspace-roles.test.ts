// Every role against every action that writes, as a table: viewers and
// billing members are refused everything but the plan, before anything is
// written (no database change, no Better Auth call); the roles a write needs
// (lib/permissions.ts) get past the role check. The server actions, the
// REST API's write gate and the upload and import gates run for real
// against in-memory tables (tests/support/fake-db.ts).
//
// "Gets past the role check" means the result isn't a role refusal: an
// allowed role may still fail for other reasons here (no plan, no network),
// and those are covered by each feature's own tests.
import { afterAll, beforeAll, describe, expect, it, test, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
  return {
    scope: null as null | {
      userId: string;
      organizationId: string;
      role: "owner" | "admin" | "member" | "billing" | "viewer";
    },
    authCalls: [] as string[],
  };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () =>
      new Headers({ host: "localhost:3000", "x-real-ip": "203.0.113.9" }),
  ),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/events/emails", () => ({
  sendTeamInviteEmail: async () => false,
}));
vi.mock("@/lib/api-quota", () => ({ consumeApiQuota: async () => {} }));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: true,
  putObject: async () => {},
  deleteObject: async () => {},
  headObject: async () => null,
  copyObject: async () => {},
  presignUpload: async () => ({ url: "https://r2.invalid/up", headers: {} }),
  presignDownload: async () => "https://r2.invalid/down",
  publicUrl: () => null,
  StorageNotConfiguredError: class extends Error {},
  ObjectChangedError: class extends Error {},
}));
// The session's workspace and role come from the test, not from cookies.
vi.mock("@/lib/scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scope")>();
  const { UnauthorizedError } = await import("@/types/errors");
  const current = async () => {
    if (!state.scope) throw new UnauthorizedError();
    return state.scope;
  };
  return {
    ...actual,
    getActiveScope: vi.fn(current),
    getActiveWorkspace: vi.fn(async () => {
      const scope = await current();
      return {
        scope,
        workspace: {
          id: scope.organizationId,
          name: "Team T",
          slug: "team-t",
          logo: null,
          role: scope.role,
          own: false,
        },
        user: {
          id: scope.userId,
          name: scope.userId,
          email: `${scope.userId}@example.com`,
        },
        sessionWorkspaceId: scope.organizationId,
      };
    }),
  };
});
// Better Auth: every call is recorded; none may happen for a refused role.
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: new Proxy(
      {},
      {
        get: (_target, method) => async () => {
          state.authCalls.push(String(method));
          return {};
        },
      },
    ),
  },
}));

const { ForbiddenError } = await import("@/lib/permissions-server");
const { can, WORKSPACE_ROLES } = await import("@/lib/permissions");
type Action = import("@/lib/permissions").WorkspaceAction;
type Role = import("@/lib/permissions").WorkspaceRole;

const qrCodes = await import("@/actions/qr-codes");
const bulk = await import("@/actions/bulk-codes");
const folders = await import("@/actions/folders");
const tags = await import("@/actions/tags");
const lifecycle = await import("@/actions/code-lifecycle");
const marketing = await import("@/actions/code-marketing");
const pages = await import("@/actions/landing-pages");
const responses = await import("@/actions/form-responses");
const files = await import("@/actions/files");
const domains = await import("@/actions/custom-domains");
const moveCode = await import("@/actions/move-code");
const teams = await import("@/actions/organizations");
const join = await import("@/actions/workspace-join");
const logo = await import("@/actions/workspace-logo");
const themes = await import("@/actions/qr-themes");
const publicStats = await import("@/actions/public-stats");
const utmTemplates = await import("@/actions/utm-templates");
const apiKeys = await import("@/app/settings/developers/_lib/api-key-actions");
const webhooks = await import("@/app/dashboard/webhooks/_lib/actions");
const { resolveApiCaller } = await import("@/app/api/v1/codes/_lib/api");
const { migrateScope } = await import("@/lib/migrate/server/http");
const { resolveUploadScope } = await import("@/lib/files/http");

const USER: Record<Role, string> = {
  owner: "u_owner",
  admin: "u_admin",
  member: "u_member",
  billing: "u_billing",
  viewer: "u_viewer",
};
const NOW = new Date("2026-11-04T12:00:00Z");

/** A team where every role is someone, and rows made by `actor`. */
function seed(actor: string) {
  fakeDb.reset();
  fakeDb.seed(
    "user",
    [...Object.values(USER), "u_other"].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      createdAt: NOW,
    })),
  );
  fakeDb.seed("organization", [
    { id: "org_t", name: "Team T", slug: "team-t", logo: null, createdAt: NOW },
    { id: "org_b", name: "Team B", slug: "team-b", logo: null, createdAt: NOW },
  ]);
  fakeDb.seed("member", [
    ...(Object.entries(USER) as [Role, string][]).map(([role, userId]) => ({
      id: `m_${role}`,
      organizationId: "org_t",
      userId,
      role,
      createdAt: NOW,
    })),
    {
      id: "m_target",
      organizationId: "org_t",
      userId: "u_other",
      role: "member",
      createdAt: NOW,
    },
    {
      id: "m_b",
      organizationId: "org_b",
      userId: actor,
      role: "member",
      createdAt: NOW,
    },
  ]);
  fakeDb.seed("subscription", [
    {
      id: "sub_owner",
      userId: "u_owner",
      productId: "prod_business_monthly",
      status: "active",
      createdAt: NOW,
    },
  ]);
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: actor,
      organizationId: "org_t",
      slug: "abc1234",
      slugScope: "",
      destinationUrl: "https://example.com/",
      title: "E2E code",
      contentType: "url",
      style: null,
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
      passwordHash: null,
      startsAt: null,
      expiresAt: null,
      scanLimit: null,
      pausedAt: null,
      fallbackUrl: null,
      routing: null,
      utm: null,
      pixels: null,
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  fakeDb.seed("folder", [
    {
      id: "folder_1",
      userId: actor,
      organizationId: "org_t",
      parentId: null,
      name: "Print",
      position: 0,
      createdAt: NOW,
    },
  ]);
  fakeDb.seed("tag", [
    {
      id: "tag_1",
      userId: actor,
      organizationId: "org_t",
      name: "Spring",
      color: null,
      createdAt: NOW,
    },
  ]);
  fakeDb.seed("landingPage", [
    {
      id: "page_1",
      userId: actor,
      organizationId: "org_t",
      type: "links",
      title: "Page",
      content: {},
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  fakeDb.seed("formResponse", [
    {
      id: "resp_1",
      pageId: "page_1",
      qrCodeId: null,
      data: {},
      visitorHash: null,
      createdAt: NOW,
    },
  ]);
  fakeDb.seed("customDomain", [
    {
      id: "dom_1",
      userId: actor,
      organizationId: "org_t",
      hostname: "links.example.com",
      verified: false,
      verification: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  fakeDb.seed("webhookEndpoint", [
    {
      id: "wh_1",
      userId: actor,
      organizationId: "org_t",
      url: "https://example.com/hook",
      events: ["code.created"],
      secret: "s",
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  fakeDb.seed("invitation", [
    {
      id: "inv_1",
      organizationId: "org_t",
      email: "pending@example.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: NOW,
      inviterId: "u_owner",
    },
  ]);
  fakeDb.seed("utmTemplate", [
    {
      id: "utm_1",
      userId: actor,
      organizationId: "org_t",
      name: "Spring",
      utm: { source: "qr" },
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  fakeDb.seed("qrPreset", [
    {
      id: "theme_1",
      userId: actor,
      organizationId: "ws_own",
      name: "Mine",
      style: {},
      isDefault: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
}

const TABLES = [
  "organization",
  "member",
  "invitation",
  "qrCode",
  "qrCodeTag",
  "folder",
  "tag",
  "landingPage",
  "formResponse",
  "fileAsset",
  "customDomain",
  "webhookEndpoint",
  "qrPreset",
  "apiKey",
  "workspaceJoinLink",
  "codePublicStats",
  "utmTemplate",
];
const snapshot = () =>
  JSON.stringify(TABLES.map((table) => fakeDb.rows(table)));

function request(path: string, method = "POST") {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
  });
}

/** Runs a gate that throws; returns what an action would report. */
async function gate(run: () => Promise<unknown>) {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) return { code: "ROLE_FORBIDDEN" };
    return { code: (error as { code?: string }).code ?? "ERROR" };
  }
}

const logoForm = () => {
  const form = new FormData();
  form.append("logo", new File([new Uint8Array([137, 80, 78, 71])], "logo"));
  return form;
};

const CASES: [string, Action, () => Promise<unknown>][] = [
  // Codes
  [
    "createQrCode",
    "content.write",
    () => qrCodes.createQrCode({ destinationUrl: "https://example.com/new" }),
  ],
  [
    "updateQrCode",
    "content.write",
    () => qrCodes.updateQrCode({ id: "code_1", title: "Renamed" }),
  ],
  [
    "setQrCodeArchived",
    "content.write",
    () => qrCodes.setQrCodeArchived({ id: "code_1", archived: true }),
  ],
  [
    "deleteQrCode",
    "content.write",
    () => qrCodes.deleteQrCode({ id: "code_1" }),
  ],
  [
    "setQrCodesFavorite",
    "content.write",
    () => bulk.setQrCodesFavorite({ ids: ["code_1"], favorite: true }),
  ],
  [
    "setQrCodeNotes",
    "content.write",
    () => bulk.setQrCodeNotes({ id: "code_1", notes: "Hi" }),
  ],
  [
    "moveQrCodes",
    "content.write",
    () => bulk.moveQrCodes({ ids: ["code_1"], folderId: "folder_1" }),
  ],
  [
    "setQrCodesPaused",
    "content.write",
    () => bulk.setQrCodesPaused({ ids: ["code_1"], paused: true }),
  ],
  [
    "setQrCodesArchived",
    "content.write",
    () => bulk.setQrCodesArchived({ ids: ["code_1"], archived: true }),
  ],
  [
    "trashQrCodes",
    "content.write",
    () => bulk.trashQrCodes({ ids: ["code_1"] }),
  ],
  [
    "restoreQrCodes",
    "content.write",
    () => bulk.restoreQrCodes({ ids: ["code_1"] }),
  ],
  [
    "purgeQrCodes",
    "content.write",
    () => bulk.purgeQrCodes({ ids: ["code_1"] }),
  ],
  ["emptyQrCodeTrash", "content.write", () => bulk.emptyQrCodeTrash()],
  [
    "duplicateQrCode",
    "content.write",
    () => bulk.duplicateQrCode({ id: "code_1" }),
  ],
  [
    "restoreQrCodeVersion",
    "content.write",
    () => bulk.restoreQrCodeVersion({ codeId: "code_1", versionId: "v_1" }),
  ],
  [
    "previewQrCodeImport",
    "content.write",
    () => bulk.previewQrCodeImport({ rows: [] } as never),
  ],
  [
    "importQrCodesChunk",
    "content.write",
    () => bulk.importQrCodesChunk({ rows: [] } as never),
  ],
  [
    "createCodeFolder",
    "content.write",
    () => folders.createCodeFolder({ name: "New", parentId: null }),
  ],
  [
    "renameCodeFolder",
    "content.write",
    () => folders.renameCodeFolder({ id: "folder_1", name: "Renamed" }),
  ],
  [
    "moveCodeFolder",
    "content.write",
    () => folders.moveCodeFolder({ id: "folder_1", parentId: null }),
  ],
  [
    "deleteCodeFolder",
    "content.write",
    () => folders.deleteCodeFolder({ id: "folder_1" }),
  ],
  [
    "createCodeTag",
    "content.write",
    () => tags.createCodeTag({ name: "New" } as never),
  ],
  [
    "updateCodeTag",
    "content.write",
    () => tags.updateCodeTag({ id: "tag_1", name: "Renamed" } as never),
  ],
  ["deleteCodeTag", "content.write", () => tags.deleteCodeTag({ id: "tag_1" })],
  [
    "setQrCodeTags",
    "content.write",
    () => tags.setQrCodeTags({ id: "code_1", tagIds: ["tag_1"] } as never),
  ],
  [
    "tagQrCodes",
    "content.write",
    () => tags.tagQrCodes({ ids: ["code_1"], tagId: "tag_1" } as never),
  ],
  [
    "updateCodeLifecycle",
    "content.write",
    () =>
      lifecycle.updateCodeLifecycle({ id: "code_1", scanLimit: null } as never),
  ],
  [
    "setCodePaused",
    "content.write",
    () => lifecycle.setCodePaused({ id: "code_1", paused: true }),
  ],
  [
    "saveCodeRouting",
    "content.write",
    () => marketing.saveCodeRouting({ id: "code_1", routing: null }),
  ],
  [
    "saveCodeUtm",
    "content.write",
    () => marketing.saveCodeUtm({ id: "code_1", utm: null } as never),
  ],
  [
    "saveCodePixels",
    "content.write",
    () => marketing.saveCodePixels({ id: "code_1", pixels: null } as never),
  ],
  [
    "moveQrCodeToWorkspace",
    "content.write",
    () =>
      moveCode.moveQrCodeToWorkspace({ id: "code_1", organizationId: "org_b" }),
  ],
  // Share analytics (public stats) and UTM templates, from #198
  [
    "setPublicStatsShareAction (on)",
    "content.write",
    () => publicStats.setPublicStatsShareAction({ codeId: "code_1", on: true }),
  ],
  [
    "setPublicStatsShareAction (off)",
    "content.write",
    () =>
      publicStats.setPublicStatsShareAction({ codeId: "code_1", on: false }),
  ],
  [
    "resetPublicStatsShareAction",
    "content.write",
    () => publicStats.resetPublicStatsShareAction({ codeId: "code_1" }),
  ],
  [
    "saveUtmTemplate",
    "content.write",
    () =>
      utmTemplates.saveUtmTemplate({
        name: "Autumn",
        utm: { source: "qr", medium: "print" },
      }),
  ],
  [
    "renameUtmTemplateAction",
    "content.write",
    () =>
      utmTemplates.renameUtmTemplateAction({ id: "utm_1", name: "Renamed" }),
  ],
  [
    "deleteUtmTemplateAction",
    "content.write",
    () => utmTemplates.deleteUtmTemplateAction({ id: "utm_1" }),
  ],
  // Pages, responses, files
  [
    "createLandingPage",
    "content.write",
    () => pages.createLandingPage({ type: "links" } as never),
  ],
  [
    "publishLandingPage",
    "content.write",
    () => pages.publishLandingPage({ id: "page_1" } as never),
  ],
  [
    "deleteLandingPage",
    "content.write",
    () => pages.deleteLandingPage({ id: "page_1" }),
  ],
  [
    "createLandingPageCode",
    "content.write",
    () => pages.createLandingPageCode({ id: "page_1" }),
  ],
  [
    "deleteFormResponses",
    "content.write",
    () => responses.deleteFormResponses({ pageId: "page_1", ids: ["resp_1"] }),
  ],
  [
    "deleteFileAction",
    "content.write",
    () => files.deleteFileAction({ id: "file_1" }),
  ],
  // Gates shared by API routes
  [
    "POST /api/v1 (session)",
    "content.write",
    () =>
      gate(() => resolveApiCaller(request("/api/v1/codes") as never, "write")),
  ],
  [
    "POST /api/migrate/*",
    "content.write",
    () =>
      gate(() => migrateScope(request("/api/migrate/jobs"), { write: true })),
  ],
  [
    "POST /api/files",
    "content.write",
    () => gate(() => resolveUploadScope(request("/api/files"))),
  ],
  // API keys
  [
    "createApiKeyAction",
    "apiKeys.create",
    () =>
      apiKeys.createApiKeyAction({
        name: "E2E key",
        scopes: ["codes:read"],
        expiresInDays: 30,
      }),
  ],
  // Workspace settings
  [
    "updateWorkspace",
    "workspace.update",
    () => teams.updateWorkspace({ name: "Renamed team" }),
  ],
  [
    "setWorkspaceLogoUrl",
    "workspace.update",
    () => logo.setWorkspaceLogoUrl({ url: "https://example.com/logo.png" }),
  ],
  [
    "uploadWorkspaceLogo",
    "workspace.update",
    () => logo.uploadWorkspaceLogo(logoForm()),
  ],
  ["removeWorkspaceLogo", "workspace.update", () => logo.removeWorkspaceLogo()],
  [
    "deleteTeam",
    "workspace.delete",
    () => teams.deleteTeam({ organizationId: "org_t", confirmSlug: "team-t" }),
  ],
  // People
  [
    "inviteMember",
    "members.manage",
    () => teams.inviteMember({ email: "new@example.com", role: "member" }),
  ],
  [
    "cancelInvitation",
    "members.manage",
    () => teams.cancelInvitation({ invitationId: "inv_1" }),
  ],
  [
    "updateMemberRole",
    "members.manage",
    () => teams.updateMemberRole({ memberId: "m_target", role: "viewer" }),
  ],
  [
    "removeMember",
    "members.manage",
    () => teams.removeMember({ memberId: "m_target" }),
  ],
  [
    "issueWorkspaceJoinLink",
    "members.manage",
    () => join.issueWorkspaceJoinLink({ role: "member" }),
  ],
  [
    "setWorkspaceJoinLinkRole",
    "members.manage",
    () => join.setWorkspaceJoinLinkRole({ role: "viewer" }),
  ],
  [
    "disableWorkspaceJoinLink",
    "members.manage",
    () => join.disableWorkspaceJoinLink(),
  ],
  // Domains, webhooks, shared themes
  [
    "addCustomDomain",
    "domains.manage",
    () => domains.addCustomDomain({ hostname: "new.example.com" }),
  ],
  [
    "verifyCustomDomain",
    "domains.manage",
    () => domains.verifyCustomDomain({ id: "dom_1" }),
  ],
  [
    "removeCustomDomain",
    "domains.manage",
    () => domains.removeCustomDomain({ id: "dom_1" }),
  ],
  [
    "createWebhookEndpoint",
    "webhooks.manage",
    () =>
      webhooks.createWebhookEndpoint({
        url: "https://example.com/new-hook",
        events: ["code.created"],
      }),
  ],
  [
    "updateWebhookEndpoint",
    "webhooks.manage",
    () => webhooks.updateWebhookEndpoint({ id: "wh_1", active: false }),
  ],
  [
    "deleteWebhookEndpoint",
    "webhooks.manage",
    () => webhooks.deleteWebhookEndpoint({ id: "wh_1" }),
  ],
  [
    "revealWebhookSecret",
    "webhooks.manage",
    () => webhooks.revealWebhookSecret({ id: "wh_1" }),
  ],
  [
    "rotateWebhookSecret",
    "webhooks.manage",
    () => webhooks.rotateWebhookSecret({ id: "wh_1" }),
  ],
  [
    "sendWebhookTest",
    "webhooks.manage",
    () => webhooks.sendWebhookTest({ id: "wh_1" }),
  ],
  [
    "retryWebhookDelivery",
    "webhooks.manage",
    () => webhooks.retryWebhookDelivery({ id: "del_1" }),
  ],
  ["copyThemeToTeam", "themes.manage", () => themes.copyThemeToTeam("theme_1")],
];

const ROLE_REFUSAL =
  /^(You're a viewer here\.|Your billing role covers the plan only\.|Only (owners|workspace owners)\b)/;

/** True when the result is a refusal because of the caller's role. */
function refusedForRole(result: unknown): boolean {
  const value = result as {
    code?: string;
    error?: string | { code?: string; message?: string };
  } | null;
  if (!value || typeof value !== "object") return false;
  if (value.code === "ROLE_FORBIDDEN") return true;
  const code = typeof value.error === "object" ? value.error?.code : value.code;
  const message =
    typeof value.error === "object" ? value.error?.message : value.error;
  if (code === "FORBIDDEN") return true;
  return typeof message === "string" && ROLE_REFUSAL.test(message);
}

beforeAll(() => {
  // Nothing here may reach the network (domain providers, webhooks, AI).
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network disabled in tests");
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());

describe.each(CASES)("%s (needs %s)", (_name, action, run) => {
  test.each([...WORKSPACE_ROLES])("as %s", async (role) => {
    seed(USER[role]);
    state.scope = { userId: USER[role], organizationId: "org_t", role };
    state.authCalls = [];
    const before = snapshot();

    const result = await run();

    if (can(role, action)) {
      expect(refusedForRole(result), JSON.stringify(result)).toBe(false);
    } else {
      expect(refusedForRole(result), JSON.stringify(result)).toBe(true);
      // Refused before anything changed.
      expect(state.authCalls).toEqual([]);
      expect(snapshot()).toBe(before);
    }
  });
});

// Shared themes: the theme screens show them read-only to anyone without
// themes.manage, and each save refuses them on the server (updateTheme and
// deleteTheme throw, setDefaultTheme answers ok: false), changing nothing.
describe("saving a shared theme", () => {
  const teamTheme = () => fakeDb.find("qrPreset", { id: "team_theme" });
  const seedTeamTheme = (actor: string) => {
    seed(actor);
    fakeDb.seed("qrPreset", [
      {
        id: "team_theme",
        userId: "u_owner",
        organizationId: "org_t",
        name: "Team brand",
        style: { fgColor: "#111111" },
        isDefault: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  };
  // "refused" only for the role checks' own answers (canEditTheme): an
  // allowed role may still stop later, e.g. at the default-theme update,
  // whose `SET is_default = (id = $1)` the in-memory tables can't run.
  const ROLE_REFUSAL =
    /can't (edit|delete) it|Only workspace owners and admins can change its default theme/;
  const attempt = async (run: () => Promise<unknown>) => {
    try {
      const result = (await run()) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (result?.ok === false) {
        return ROLE_REFUSAL.test(result.error ?? "") ? "refused" : "other";
      }
      return "saved";
    } catch (error) {
      return ROLE_REFUSAL.test(String(error)) ? "refused" : "other";
    }
  };
  const SAVES: [string, () => Promise<unknown>][] = [
    [
      "updateTheme",
      () => themes.updateTheme({ id: "team_theme", name: "Renamed" }),
    ],
    ["setDefaultTheme", () => themes.setDefaultTheme("team_theme", true)],
    ["deleteTheme", () => themes.deleteTheme("team_theme")],
  ];

  describe.each(SAVES)("%s", (_name, run) => {
    it.each([...WORKSPACE_ROLES])("as %s", async (role) => {
      seedTeamTheme(USER[role]);
      state.scope = { userId: USER[role], organizationId: "org_t", role };
      const before = JSON.stringify(teamTheme());
      const outcome = await attempt(run);
      if (can(role, "themes.manage")) {
        expect(outcome).not.toBe("refused");
      } else {
        expect(outcome).toBe("refused");
        expect(JSON.stringify(teamTheme())).toBe(before);
      }
    });
  });
});

// ─── The lists' bulk keys (feat/bulk-keys-range-select) ─────────────────────
// What the codes and pages lists' bulk toolbar and keys call, with several
// rows selected (app/dashboard/_lib/list-keys.ts offers these keys only with
// content.write). Viewers and billing members are refused on the server
// before anything changes; the roles that write get past the role check.
describe("bulk keys' endpoints, with several rows", () => {
  const seedMany = (actor: string) => {
    seed(actor);
    const code = fakeDb.find("qrCode", { id: "code_1" });
    const page = fakeDb.find("landingPage", { id: "page_1" });
    fakeDb.seed("qrCode", [{ ...code, id: "code_2", slug: "abc1235" }]);
    fakeDb.seed("landingPage", [{ ...page, id: "page_2" }]);
  };
  const codes = ["code_1", "code_2"];
  const BULK: [string, () => Promise<unknown>][] = [
    [
      "setQrCodesArchived (A)",
      () => bulk.setQrCodesArchived({ ids: codes, archived: true }),
    ],
    [
      "moveQrCodes (M)",
      () => bulk.moveQrCodes({ ids: codes, folderId: "folder_1" }),
    ],
    [
      "tagQrCodes (T)",
      () => tags.tagQrCodes({ ids: codes, add: ["tag_1"], remove: [] }),
    ],
    ["trashQrCodes (Backspace)", () => bulk.trashQrCodes({ ids: codes })],
    [
      "restoreQrCodes (R, in the trash)",
      () => bulk.restoreQrCodes({ ids: codes }),
    ],
    [
      "purgeQrCodes (Backspace, in the trash)",
      () => bulk.purgeQrCodes({ ids: codes }),
    ],
    [
      "deleteLandingPages (Backspace, Pages)",
      () => pages.deleteLandingPages({ ids: ["page_1", "page_2"] }),
    ],
  ];

  describe.each(BULK)("%s", (_name, run) => {
    it.each([...WORKSPACE_ROLES])("as %s", async (role) => {
      seedMany(USER[role]);
      state.scope = { userId: USER[role], organizationId: "org_t", role };
      state.authCalls = [];
      const before = snapshot();

      const result = await run();

      if (can(role, "content.write")) {
        expect(refusedForRole(result), JSON.stringify(result)).toBe(false);
      } else {
        expect(refusedForRole(result), JSON.stringify(result)).toBe(true);
        expect(state.authCalls).toEqual([]);
        expect(snapshot()).toBe(before);
      }
    });
  });

  it("deletes a member's own pages and skips a teammate's", async () => {
    seedMany(USER.member);
    fakeDb.seed("landingPage", [
      {
        ...fakeDb.find("landingPage", { id: "page_1" }),
        id: "page_theirs",
        userId: "u_other",
      },
    ]);
    state.scope = {
      userId: USER.member,
      organizationId: "org_t",
      role: "member",
    };
    const result = await pages.deleteLandingPages({
      ids: ["page_1", "page_theirs", "page_2"],
    });
    expect(result).toEqual({
      success: true,
      data: { deleted: 2, skipped: 1, deletedCodes: 0 },
    });
    expect(fakeDb.find("landingPage", { id: "page_theirs" })).toBeDefined();
    expect(fakeDb.find("landingPage", { id: "page_1" })).toBeUndefined();
  });
});
