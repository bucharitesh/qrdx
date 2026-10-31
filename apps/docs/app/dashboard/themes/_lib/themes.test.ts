// Tests the scope/permission rules for saved themes (no database: only the
// pure helpers run). Needs a dummy DATABASE_URL because lib/env validates on import:
//   cd apps/docs && DATABASE_URL=postgres://test@127.0.0.1:1/test \
//     npx tsx --conditions=react-server --test app/dashboard/themes/_lib/themes.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActiveScope } from "@/lib/scope";
import {
  canEditTheme,
  canManageTeamThemes,
  teamThemesPlanName,
  toSavedTheme,
} from "./queries";

const personal: ActiveScope = {
  userId: "me",
  organizationId: null,
  role: "owner",
};
const teamAdmin: ActiveScope = {
  userId: "me",
  organizationId: "team-a",
  role: "admin",
};
const teamMember: ActiveScope = { ...teamAdmin, role: "member" };

const row = (overrides: {
  userId?: string;
  organizationId?: string | null;
  isDefault?: boolean;
}) => ({
  id: "theme",
  name: "Brand",
  userId: overrides.userId ?? "me",
  organizationId: overrides.organizationId ?? null,
  isDefault: overrides.isDefault ?? false,
  style: { fgColor: "#111111" },
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
  isPublished: null,
});

describe("canManageTeamThemes", () => {
  it("lets owners and admins manage team themes, not members", () => {
    assert.equal(canManageTeamThemes({ role: "owner" }), true);
    assert.equal(canManageTeamThemes({ role: "admin" }), true);
    assert.equal(canManageTeamThemes({ role: "member" }), false);
  });
});

describe("canEditTheme", () => {
  it("allows your own personal themes in every workspace", () => {
    const mine = { userId: "me", organizationId: null };
    assert.equal(canEditTheme(personal, mine), true);
    assert.equal(canEditTheme(teamMember, mine), true);
  });

  it("never allows someone else's personal theme", () => {
    assert.equal(
      canEditTheme(personal, { userId: "other", organizationId: null }),
      false,
    );
  });

  it("allows team themes only to owners/admins of that active team", () => {
    const shared = { userId: "other", organizationId: "team-a" };
    assert.equal(canEditTheme(teamAdmin, shared), true);
    assert.equal(canEditTheme(teamMember, shared), false);
    assert.equal(canEditTheme(personal, shared), false);
    assert.equal(
      canEditTheme(
        { ...teamAdmin, organizationId: "team-b" },
        { userId: "me", organizationId: "team-a" },
      ),
      false,
    );
  });
});

describe("toSavedTheme", () => {
  it("marks the personal default as active only in the personal workspace", () => {
    const theme = row({ isDefault: true });
    assert.equal(toSavedTheme(personal, theme).isActiveDefault, true);
    assert.equal(toSavedTheme(teamAdmin, theme).isActiveDefault, false);
    assert.equal(toSavedTheme(teamAdmin, theme).scope, "personal");
  });

  it("marks the team default as active inside the team", () => {
    const theme = row({
      userId: "other",
      organizationId: "team-a",
      isDefault: true,
    });
    const saved = toSavedTheme(teamMember, theme);
    assert.equal(saved.scope, "team");
    assert.equal(saved.isActiveDefault, true);
    assert.equal(saved.canEdit, false);
    assert.equal(saved.isPublished, false);
  });

  it("does not mark non-default themes as default", () => {
    assert.equal(toSavedTheme(personal, row({})).isActiveDefault, false);
  });
});

describe("teamThemesPlanName", () => {
  it("names the cheapest plan whose limits include team themes", () => {
    assert.ok(["Pro", "Business"].includes(teamThemesPlanName()));
  });
});
