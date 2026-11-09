// The audit log is in ee/ under the QRdx commercial licence: without
// QRDX_EE_LICENSE nothing is recorded, its settings page and help page leave
// the navigation, and reading it answers 404. With the key it's all back.
// Also: the copy that quotes its numbers says what the code does.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getOwnerPlanForOrganization: async () => "business",
}));
vi.mock("@/lib/log-error", () => ({ logError: () => {} }));

async function load(license: string | undefined) {
  vi.resetModules();
  vi.stubEnv("QRDX_EE_LICENSE", license);
  const availability = await import("@/lib/feature-availability");
  const { writeAuditEvents } = await import("@/ee/audit-log/record");
  const { requireAuditLogAccess } = await import("@/ee/audit-log/access");
  // The in-memory database these freshly loaded modules write to.
  const { database, workspaceAuditLog } = (await import(
    "@repo/database"
  )) as typeof import("@repo/database");
  const stored = async () =>
    (await database.select().from(workspaceAuditLog)).length;
  return { ...availability, writeAuditEvents, requireAuditLogAccess, stored };
}

const event = {
  action: "code.created" as const,
  target: { type: "code" as const, id: "c1", label: "Menu" },
};
const ctx = { userId: "u_ana", organizationId: "org_acme" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("without QRDX_EE_LICENSE", () => {
  it("records nothing, hides the pages and answers 404", async () => {
    const app = await load(undefined);
    expect(app.isFeatureAvailable("auditLog")).toBe(false);
    expect(app.isPathAvailable("/dashboard/acme/settings/audit-log")).toBe(
      false,
    );
    expect(app.isPathAvailable("/docs/help/teams/audit-log")).toBe(false);
    expect(await app.writeAuditEvents(ctx, [event])).toBe(0);
    expect(await app.stored()).toBe(0);
    await expect(
      app.requireAuditLogAccess({ organizationId: "org_acme", role: "owner" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("with QRDX_EE_LICENSE", () => {
  it("records and shows it", async () => {
    const app = await load("local-dev");
    expect(app.isFeatureAvailable("auditLog")).toBe(true);
    expect(app.isPathAvailable("/dashboard/acme/settings/audit-log")).toBe(
      true,
    );
    expect(await app.writeAuditEvents(ctx, [event])).toBe(1);
    expect(await app.stored()).toBe(1);
  });
});

describe("copy", () => {
  const app = path.resolve(import.meta.dirname, "../..");
  const read = (file: string) => readFileSync(path.join(app, file), "utf8");

  it("states the retention the code applies", async () => {
    const { AUDIT_RETENTION_DAYS } = await import("@/ee/audit-log/limits");
    expect(read("content/legal/privacy-policy.mdx")).toContain(
      `| Workspace audit log | ${AUDIT_RETENTION_DAYS} days, and deleted with the workspace. Entries keep the name, email address and IP address of the person who made each change for those ${AUDIT_RETENTION_DAYS} days, also after that person leaves the workspace or deletes their account |`,
    );
  });

  it("quotes the numbers in the help page from code", () => {
    const help = read("content/docs/help/teams/audit-log.mdx");
    expect(help).toContain("{facts.auditLogRetentionDays}");
    expect(help).toContain("{facts.auditLogExportRows}");
    expect(help).not.toMatch(/\b365\b|50,000/);
    expect(help).toContain('<IfAvailable feature="auditLog">');
  });
});
