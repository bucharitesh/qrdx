// Pure rules behind the admin support tools (app/admin/_lib/rules.ts).
import { describe, expect, it } from "vitest";
import {
  CANCELED_IMPORT_REASON,
  cancelImportJob,
  canUnlinkSignInMethod,
  confirmsEmail,
  INVITATION_TTL_MS,
  isStuckImport,
  parseAdminSearch,
  polarCustomerUrl,
  requeueImportJob,
  requiredReason,
  resentInvitationExpiry,
  SEARCH_KINDS,
  STUCK_IMPORT_MS,
} from "@/app/admin/_lib/rules";
import type { ImportJob, JobItem } from "@/lib/migrate/types";

describe("parseAdminSearch", () => {
  it("returns null for empty input", () => {
    expect(parseAdminSearch("")).toBeNull();
    expect(parseAdminSearch("   ")).toBeNull();
    expect(parseAdminSearch(undefined)).toBeNull();
    expect(parseAdminSearch("code:  ")).toBeNull();
  });

  it("searches every group for plain text", () => {
    const parsed = parseAdminSearch("  summer   sale ");
    expect(parsed).toMatchObject({
      term: "summer sale",
      kinds: [...SEARCH_KINDS],
      slug: null,
      email: false,
      clientId: false,
    });
  });

  it("sends email addresses to users only", () => {
    expect(parseAdminSearch("Jane@Example.com")).toMatchObject({
      term: "Jane@Example.com",
      kinds: ["user"],
      email: true,
    });
  });

  it("reads kind prefixes", () => {
    expect(parseAdminSearch("code:abc")).toMatchObject({
      term: "abc",
      kinds: ["code"],
    });
    expect(parseAdminSearch("TEAM: Acme Inc")).toMatchObject({
      term: "Acme Inc",
      kinds: ["team"],
    });
    expect(parseAdminSearch("client:qrdx_app_0011")?.kinds).toEqual(["app"]);
    expect(parseAdminSearch("slug:Ab12Cd3")?.kinds).toEqual(["code", "page"]);
    expect(parseAdminSearch("email:jane")?.kinds).toEqual(["user"]);
  });

  it("keeps unknown prefixes as text", () => {
    expect(parseAdminSearch("foo:bar")).toMatchObject({
      term: "foo:bar",
      kinds: [...SEARCH_KINDS],
    });
  });

  it("finds the slug in pasted short links", () => {
    expect(parseAdminSearch("https://qrdx.dev/q/Ab12Cd3")).toMatchObject({
      slug: "Ab12Cd3",
      kinds: ["code", "page"],
      email: false,
    });
    expect(parseAdminSearch("https://qrdx.dev/p/Xy98Zw7/")).toMatchObject({
      slug: "Xy98Zw7",
      kinds: ["page", "code"],
    });
    expect(parseAdminSearch("/q/Ab12Cd3")?.slug).toBe("Ab12Cd3");
    expect(parseAdminSearch("page:https://qrdx.dev/p/Xy98Zw7")).toMatchObject({
      slug: "Xy98Zw7",
      kinds: ["page"],
    });
  });

  it("treats other URLs as destinations, not slugs", () => {
    const parsed = parseAdminSearch("https://example.com/shop?x=1");
    expect(parsed?.slug).toBeNull();
    expect(parsed?.kinds).toEqual([...SEARCH_KINDS]);
  });

  it("recognises OAuth client ids", () => {
    expect(parseAdminSearch("qrdx_app_0123456789abcdef01234567")).toMatchObject(
      { kinds: ["app"], clientId: true },
    );
  });

  it("caps the length", () => {
    expect(parseAdminSearch("x".repeat(500))?.term).toHaveLength(200);
  });
});

describe("canUnlinkSignInMethod", () => {
  const github = { id: "a1" };
  const google = { id: "a2" };

  it("never unlinks the last linked method", () => {
    const result = canUnlinkSignInMethod([github], "a1");
    expect(result.ok).toBe(false);
  });

  it("unlinks one of several", () => {
    expect(canUnlinkSignInMethod([github, google], "a1")).toEqual({ ok: true });
  });

  it("rejects methods that aren't linked to the user", () => {
    expect(canUnlinkSignInMethod([github, google], "zz").ok).toBe(false);
    expect(canUnlinkSignInMethod([], "a1").ok).toBe(false);
  });
});

describe("reasons and confirmations", () => {
  it("needs a real reason", () => {
    expect(requiredReason.safeParse("").success).toBe(false);
    expect(requiredReason.safeParse("  ok ").success).toBe(false);
    expect(requiredReason.safeParse("Ticket 42").success).toBe(true);
    expect(requiredReason.safeParse("x".repeat(501)).success).toBe(false);
  });

  it("matches the typed email case-insensitively", () => {
    expect(confirmsEmail(" Jane@Example.com ", "jane@example.com")).toBe(true);
    expect(confirmsEmail("jane@example.co", "jane@example.com")).toBe(false);
    expect(confirmsEmail("", "")).toBe(false);
  });
});

describe("import job repair", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const item = (key: string, status: JobItem["status"]): JobItem => ({
    key,
    shortLink: `https://bit.ly/${key}`,
    url: `https://example.com/${key}`,
    title: null,
    tags: [],
    createdAt: null,
    slug: null,
    status,
    ...(status === "failed" ? { reason: "Rate limited" } : {}),
  });
  const job = (overrides: Partial<ImportJob> = {}): ImportJob => ({
    id: "job1",
    provider: "bitly",
    organizationId: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    status: "done",
    options: {} as ImportJob["options"],
    cursor: 3,
    items: [item("a", "created"), item("b", "failed"), item("c", "skipped")],
    ...overrides,
  });

  it("spots stuck imports", () => {
    const old = new Date(now.getTime() - STUCK_IMPORT_MS - 1).toISOString();
    expect(isStuckImport(job({ status: "running", updatedAt: old }), now)).toBe(
      true,
    );
    expect(
      isStuckImport(
        job({ status: "running", updatedAt: now.toISOString() }),
        now,
      ),
    ).toBe(false);
    expect(isStuckImport(job({ status: "done", updatedAt: old }), now)).toBe(
      false,
    );
  });

  it("re-queues failed links and points the cursor at them", () => {
    const next = requeueImportJob(job(), now);
    expect(next.status).toBe("running");
    expect(next.cursor).toBe(1);
    expect(next.items[1]).toMatchObject({ key: "b", status: "pending" });
    expect(next.items[1]).not.toHaveProperty("reason");
    expect(next.items[0]?.status).toBe("created");
    expect(next.updatedAt).toBe(now.toISOString());
  });

  it("cancels: waiting links fail, finished ones stay", () => {
    const running = job({
      status: "running",
      cursor: 1,
      items: [item("a", "created"), item("b", "pending"), item("c", "pending")],
    });
    const next = cancelImportJob(running, now);
    expect(next.status).toBe("done");
    expect(next.cursor).toBe(3);
    expect(next.items.map((entry) => entry.status)).toEqual([
      "created",
      "failed",
      "failed",
    ]);
    expect(next.items[1]?.reason).toBe(CANCELED_IMPORT_REASON);
  });
});

describe("billing and invitations", () => {
  it("links to the Polar customer when the organization is known", () => {
    expect(
      polarCustomerUrl({
        customerId: "cus/1",
        organizationSlug: "qrdx",
        sandbox: false,
      }),
    ).toBe("https://polar.sh/dashboard/qrdx/customers/cus%2F1");
    expect(
      polarCustomerUrl({
        customerId: "c",
        organizationSlug: null,
        sandbox: true,
      }),
    ).toBe("https://sandbox.polar.sh/dashboard");
  });

  it("gives a resent invitation a fresh 48 hours only when needed", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    const later = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(resentInvitationExpiry(later, now)).toBe(later);
    const expired = new Date(now.getTime() - 1000);
    expect(resentInvitationExpiry(expired, now).getTime()).toBe(
      now.getTime() + INVITATION_TTL_MS,
    );
  });
});
