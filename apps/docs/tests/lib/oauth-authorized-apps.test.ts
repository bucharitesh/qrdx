import { describe, expect, it } from "vitest";
import {
  type AuthorizationRow,
  groupAuthorizedApps,
  isLiveGrant,
} from "@/lib/oauth-apps/authorized-group";

const NOW = new Date("2026-11-01T12:00:00Z");
const day = (offset: number) =>
  new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000);

function row(overrides: Partial<AuthorizationRow> = {}): AuthorizationRow {
  return {
    appId: "app_1",
    name: "Menu Sync",
    logoUrl: null,
    websiteUrl: "https://menusync.example",
    verified: false,
    firstParty: false,
    builtBy: "Acme Inc",
    appActive: true,
    scopes: ["codes:read"],
    createdAt: day(-10),
    updatedAt: day(-10),
    accessTokenExpiresAt: day(-9),
    refreshTokenExpiresAt: day(20),
    ...overrides,
  };
}

describe("isLiveGrant", () => {
  it("is live while the refresh token is valid, even with an expired access token", () => {
    expect(isLiveGrant(row(), NOW)).toBe(true);
  });

  it("is dead once the refresh token expires", () => {
    expect(isLiveGrant(row({ refreshTokenExpiresAt: day(-1) }), NOW)).toBe(
      false,
    );
  });

  it("uses the access token when there is no refresh token", () => {
    expect(
      isLiveGrant(
        row({ refreshTokenExpiresAt: null, accessTokenExpiresAt: day(1) }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isLiveGrant(
        row({ refreshTokenExpiresAt: null, accessTokenExpiresAt: day(-1) }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("groupAuthorizedApps", () => {
  it("returns nothing when there are no live tokens", () => {
    expect(groupAuthorizedApps([], NOW)).toEqual([]);
    expect(
      groupAuthorizedApps([row({ refreshTokenExpiresAt: day(-1) })], NOW),
    ).toEqual([]);
  });

  it("merges an app's tokens into one entry", () => {
    const apps = groupAuthorizedApps(
      [
        row({
          scopes: ["codes:write"],
          createdAt: day(-3),
          updatedAt: day(-1),
        }),
        row({ scopes: ["profile:read", "codes:read"], createdAt: day(-10) }),
      ],
      NOW,
    );
    expect(apps).toHaveLength(1);
    const [app] = apps;
    expect(app.id).toBe("app_1");
    // Union, in the consent screen's order, without duplicates.
    expect(app.scopes).toEqual(["profile:read", "codes:read", "codes:write"]);
    expect(app.authorizedAt).toBe(day(-10).toISOString());
    expect(app.lastActiveAt).toBe(day(-1).toISOString());
  });

  it("ignores unknown or malformed scopes", () => {
    const [app] = groupAuthorizedApps(
      [row({ scopes: ["codes:read", "admin:all", 42] }), row({ scopes: null })],
      NOW,
    );
    expect(app.scopes).toEqual(["codes:read"]);
  });

  it("skips dead tokens when dating an app", () => {
    const [app] = groupAuthorizedApps(
      [
        row({ createdAt: day(-30), refreshTokenExpiresAt: day(-2) }),
        row({ createdAt: day(-5), updatedAt: day(-5) }),
      ],
      NOW,
    );
    expect(app.authorizedAt).toBe(day(-5).toISOString());
  });

  it("orders apps by most recent activity and keeps publisher details", () => {
    const apps = groupAuthorizedApps(
      [
        row({ appId: "old", name: "Old", updatedAt: day(-8) }),
        row({
          appId: "qrdx",
          name: "QRdx for Raycast",
          firstParty: true,
          builtBy: "QRdx",
          updatedAt: day(-1),
        }),
        row({
          appId: "paused",
          name: "Paused",
          appActive: false,
          updatedAt: day(-4),
        }),
      ],
      NOW,
    );
    expect(apps.map((app) => app.id)).toEqual(["qrdx", "paused", "old"]);
    expect(apps[0]).toMatchObject({ firstParty: true, builtBy: "QRdx" });
    expect(apps[1].paused).toBe(true);
  });
});
