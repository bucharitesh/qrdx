// Who is an admin (@repo/auth/admin-rules): the admin role, or the bootstrap
// lists (user ids, and verified emails in any case). Pure, so the
// back-office console applies the same rule to the session this app returns.
import {
  hasAdminRole,
  isAdminWith,
  isListedAdmin,
  parseAdminList,
} from "@repo/auth/admin-rules";
import { afterEach, describe, expect, it, vi } from "vitest";

const LISTS = { ids: ["u_listed"], emails: ["Owner@Example.com"] };

describe("parseAdminList", () => {
  it("splits, trims and drops empty entries", () => {
    expect(parseAdminList(" a@x.com, ,b@x.com ,")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
    expect(parseAdminList(undefined)).toEqual([]);
    expect(parseAdminList(null)).toEqual([]);
  });
});

describe("hasAdminRole", () => {
  it.each([
    ["admin", true],
    ["user,admin", true],
    ["user, admin", true],
    ["user", false],
    ["administrator", false],
    [null, false],
  ])("%s → %s", (role, expected) => {
    expect(hasAdminRole(role)).toBe(expected);
  });
});

describe("isAdminWith", () => {
  it("accepts the admin role without any list", () => {
    expect(
      isAdminWith({ id: "u1", role: "admin" }, { ids: [], emails: [] }),
    ).toBe(true);
  });

  it("accepts a listed id", () => {
    expect(isAdminWith({ id: "u_listed" }, LISTS)).toBe(true);
  });

  it("accepts a listed email only once it's verified, in any case", () => {
    const user = { id: "u2", email: "owner@example.COM" };
    expect(isAdminWith({ ...user, emailVerified: true }, LISTS)).toBe(true);
    expect(isAdminWith({ ...user, emailVerified: false }, LISTS)).toBe(false);
    expect(isAdminWith({ ...user, emailVerified: null }, LISTS)).toBe(false);
  });

  it("refuses everyone else", () => {
    expect(
      isAdminWith(
        { id: "u3", email: "someone@example.com", emailVerified: true },
        LISTS,
      ),
    ).toBe(false);
    expect(isListedAdmin({ id: "u3", role: "admin" }, LISTS)).toBe(false);
  });
});

// @repo/auth/admin applies the same rule to this deployment's lists.
describe("@repo/auth/admin, bound to ADMIN_USER_IDS and ADMIN_EMAILS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads both lists from the environment", async () => {
    vi.stubEnv("ADMIN_USER_IDS", "u_listed, u_other");
    vi.stubEnv("ADMIN_EMAILS", "Owner@Example.com");
    const { getAdminUserIds, isAdmin, isBootstrapAdmin } = await import(
      "@repo/auth/admin"
    );
    expect(getAdminUserIds()).toEqual(["u_listed", "u_other"]);
    expect(isBootstrapAdmin({ id: "u_listed" })).toBe(true);
    expect(
      isBootstrapAdmin({
        id: "u2",
        email: "owner@example.com",
        emailVerified: true,
      }),
    ).toBe(true);
    expect(
      isBootstrapAdmin({
        id: "u2",
        email: "owner@example.com",
        emailVerified: false,
      }),
    ).toBe(false);
    expect(isAdmin({ id: "u3", role: "admin" })).toBe(true);
    expect(isAdmin({ id: "u3", role: "user" })).toBe(false);
  });
});
