// The workspace permission table (lib/permissions.ts), spelled out cell by
// cell: if a cell changes, this test says which role gained or lost what.
import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canAssignRole,
  forbiddenMessage,
  holdsPlanRole,
  isReadOnlyRole,
  strongestRole,
  WORKSPACE_ACTIONS,
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLES,
  type WorkspaceAction,
  type WorkspaceRole,
} from "@/lib/permissions";

// Rows: actions. Columns: owner, admin, member, billing, viewer.
const MATRIX: Record<
  WorkspaceAction,
  [boolean, boolean, boolean, boolean, boolean]
> = {
  "content.write": [true, true, true, false, false],
  "content.manageAll": [true, true, false, false, false],
  "workspace.update": [true, true, false, false, false],
  "workspace.delete": [true, false, false, false, false],
  "members.manage": [true, true, false, false, false],
  "owners.manage": [true, false, false, false, false],
  "domains.manage": [true, true, false, false, false],
  "sso.manage": [true, true, false, false, false],
  "webhooks.manage": [true, true, false, false, false],
  "themes.manage": [true, true, false, false, false],
  "apiKeys.create": [true, true, true, false, false],
  "apiKeys.manageAll": [true, true, false, false, false],
  "oauthApps.manage": [true, false, false, false, false],
  "billing.manage": [true, false, false, true, false],
};

const ROLES: WorkspaceRole[] = [
  "owner",
  "admin",
  "member",
  "billing",
  "viewer",
];

describe("can(role, action)", () => {
  it("covers every action the app knows", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...WORKSPACE_ACTIONS].sort());
    expect([...WORKSPACE_ROLES]).toEqual(ROLES);
  });

  for (const action of WORKSPACE_ACTIONS) {
    it.each(ROLES.map((role, index) => [role, MATRIX[action][index]] as const))(
      `${action}: %s → %s`,
      (role, allowed) => {
        expect(can(role, action)).toBe(allowed);
      },
    );
  }

  it("refuses everything without a role", () => {
    for (const action of WORKSPACE_ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  it("makes viewers and billing members read-only", () => {
    expect(ROLES.filter(isReadOnlyRole)).toEqual(["billing", "viewer"]);
  });
});

describe("strongestRole", () => {
  it.each([
    ["owner,admin", "owner"],
    ["member, admin", "admin"],
    ["member,billing", "member"],
    ["viewer,billing", "billing"],
    ["viewer", "viewer"],
    ["", "viewer"],
    [null, "viewer"],
    // Unknown roles grant no more than reading.
    ["superuser", "viewer"],
  ] as const)("%s → %s", (field, role) => {
    expect(strongestRole(field)).toBe(role);
  });
});

describe("who can hand out which role", () => {
  it("lets owners give every role and take any away", () => {
    expect(assignableRoles("owner")).toEqual(ROLES);
    expect(canAssignRole("owner", "billing", "viewer")).toBe(true);
  });

  it("lets admins handle admin, member and viewer, never owner or billing", () => {
    expect(assignableRoles("admin")).toEqual(["admin", "member", "viewer"]);
    expect(canAssignRole("admin", "owner", "admin")).toBe(false);
    expect(canAssignRole("admin", "billing", "member")).toBe(false);
    expect(canAssignRole("admin", "member", "billing")).toBe(false);
    expect(canAssignRole("admin", "viewer", "member")).toBe(true);
  });

  it("lets nobody else change roles", () => {
    for (const actor of ["member", "billing", "viewer"] as const) {
      expect(assignableRoles(actor)).toEqual([]);
    }
  });
});

describe("plan roles", () => {
  it("counts owners and billing members as the ones who pay", () => {
    expect(holdsPlanRole("owner")).toBe(true);
    expect(holdsPlanRole("member, billing")).toBe(true);
    expect(holdsPlanRole("admin")).toBe(false);
    expect(holdsPlanRole("viewer")).toBe(false);
    expect(holdsPlanRole(null)).toBe(false);
  });
});

describe("copy", () => {
  it("describes every role in one line", () => {
    for (const role of ROLES) {
      const line = WORKSPACE_ROLE_DESCRIPTIONS[role];
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toMatch(/\n|TBD|\[\[/);
    }
  });

  it("tells viewers and billing members why", () => {
    expect(forbiddenMessage("viewer", "content.write")).toBe(
      "You're a viewer here. Only owners, admins and members can create or change things in this workspace.",
    );
    expect(forbiddenMessage("billing", "domains.manage")).toBe(
      "Your billing role covers the plan only. Only owners and admins can manage this workspace's domains.",
    );
    expect(forbiddenMessage("member", "billing.manage")).toBe(
      "Only owners and billing members can change this workspace's plan.",
    );
  });
});
