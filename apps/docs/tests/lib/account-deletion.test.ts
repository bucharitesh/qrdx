// Account deletion pre-checks (lib/account/deletion.ts) and the profile
// picture helpers it relies on (lib/account/avatar.ts).
import { describe, expect, it } from "vitest";
import {
  avatarKey,
  avatarKeyFromImage,
  initialsOf,
  isAvatarKey,
} from "@/lib/account/avatar";
import {
  canDeliverSignInCodes,
  type DeletionFacts,
  describeDeletionPlan,
  isDeleteConfirmed,
  isRecentSignIn,
  pickSuccessor,
  planAccountDeletion,
  roleRank,
  type TeamMemberFacts,
} from "@/lib/account/deletion";

const at = (day: number) => new Date(Date.UTC(2026, 0, day));

function person(
  id: string,
  role: string,
  joined: number,
  overrides: Partial<TeamMemberFacts> = {},
): TeamMemberFacts {
  return {
    memberId: `m_${id}`,
    userId: `u_${id}`,
    name: id[0].toUpperCase() + id.slice(1),
    email: `${id}@example.com`,
    role,
    createdAt: at(joined),
    ...overrides,
  };
}

function facts(overrides: Partial<DeletionFacts> = {}): DeletionFacts {
  return {
    teams: [],
    subscription: null,
    billingConfigured: true,
    personal: { codes: 0, pages: 0, files: 0, domains: 0 },
    ...overrides,
  };
}

describe("roleRank and pickSuccessor", () => {
  it("ranks the best of several roles", () => {
    expect(roleRank("owner")).toBe(0);
    expect(roleRank("member, admin")).toBe(1);
    expect(roleRank("member")).toBe(2);
    expect(roleRank(null)).toBe(3);
  });

  it("prefers another owner, then the senior admin, then the longest-standing member", () => {
    const ada = person("ada", "member", 1);
    const bob = person("bob", "admin", 9);
    const cy = person("cy", "admin", 3);
    const dee = person("dee", "owner", 20);
    expect(pickSuccessor([ada, bob, cy, dee])?.userId).toBe("u_dee");
    expect(pickSuccessor([ada, bob, cy])?.userId).toBe("u_cy");
    expect(pickSuccessor([ada])?.userId).toBe("u_ada");
    expect(pickSuccessor([])).toBeNull();
  });
});

describe("planAccountDeletion", () => {
  it("makes the successor an owner when you are a team's only owner", () => {
    const plan = planAccountDeletion(
      facts({
        teams: [
          {
            organizationId: "org_1",
            name: "Acme",
            role: "owner",
            others: [person("ada", "member", 1), person("bob", "admin", 5)],
          },
        ],
      }),
    );
    expect(plan.blockers).toEqual([]);
    expect(plan.teams).toEqual([
      {
        organizationId: "org_1",
        name: "Acme",
        action: "hand-over",
        promote: true,
        successor: {
          memberId: "m_bob",
          userId: "u_bob",
          name: "Bob",
          email: "bob@example.com",
          role: "admin",
        },
      },
    ]);
  });

  it("only hands content over when another owner remains, or you aren't an owner", () => {
    const plan = planAccountDeletion(
      facts({
        teams: [
          {
            organizationId: "org_1",
            name: "Acme",
            role: "owner",
            others: [person("dee", "owner", 2), person("bob", "admin", 1)],
          },
          {
            organizationId: "org_2",
            name: "Beta",
            role: "member",
            others: [person("ada", "member", 1)],
          },
          {
            // Left the team, still created content there.
            organizationId: "org_3",
            name: "Gamma",
            role: null,
            others: [person("cy", "owner", 1)],
          },
        ],
      }),
    );
    expect(
      plan.teams.map((team) =>
        team.action === "hand-over"
          ? [team.name, team.successor.userId, team.promote]
          : [team.name, team.action],
      ),
    ).toEqual([
      ["Acme", "u_dee", false],
      ["Beta", "u_ada", false],
      ["Gamma", "u_cy", false],
    ]);
  });

  it("deletes teams where you are the only member", () => {
    const plan = planAccountDeletion(
      facts({
        teams: [
          { organizationId: "org_1", name: "Solo", role: "owner", others: [] },
          { organizationId: "org_2", name: "Empty", role: null, others: [] },
        ],
      }),
    );
    expect(plan.teams.map((team) => team.action)).toEqual([
      "delete-team",
      "none",
    ]);
  });

  it("cancels an active subscription, and blocks when billing can't", () => {
    const subscription = {
      status: "active",
      planName: "Pro",
      currentPeriodEnd: at(30),
      cancelAtPeriodEnd: false,
    };
    const ok = planAccountDeletion(facts({ subscription }));
    expect(ok.blockers).toEqual([]);
    expect(ok.subscription).toMatchObject({ planName: "Pro", cancel: true });

    const blocked = planAccountDeletion(
      facts({ subscription, billingConfigured: false }),
    );
    expect(blocked.blockers).toHaveLength(1);
    expect(blocked.blockers[0]).toMatch(/Pro subscription can't be cancelled/);
  });

  it("free users without teams have nothing in the way", () => {
    const plan = planAccountDeletion(facts({ billingConfigured: false }));
    expect(plan).toMatchObject({ blockers: [], teams: [], subscription: null });
  });
});

describe("describeDeletionPlan", () => {
  it("spells out what happens, team by team", () => {
    const summary = describeDeletionPlan(
      planAccountDeletion(
        facts({
          personal: { codes: 12, pages: 1, files: 0, domains: 2 },
          subscription: {
            status: "active",
            planName: "Business",
            currentPeriodEnd: at(30),
            cancelAtPeriodEnd: false,
          },
          teams: [
            {
              organizationId: "org_1",
              name: "Acme",
              role: "owner",
              others: [person("bob", "admin", 5)],
            },
            {
              organizationId: "org_2",
              name: "Solo",
              role: "owner",
              others: [],
            },
          ],
        }),
      ),
    );
    expect(summary.consequences).toEqual([
      'Your personal workspace is deleted, with its 12 codes, 1 hosted page and 2 custom domains, plus your scans, themes, webhooks and integrations. Its printed QR codes show a "QR code not found" page.',
      "Acme: Bob (admin) becomes an owner and takes over what you created in the team, so its codes keep working.",
      "Solo: you're the only member, so the team and its content are deleted.",
      "Your Business subscription is cancelled straight away.",
      "You're signed out on every device.",
    ]);
  });

  it("keeps it short for an empty account", () => {
    expect(
      describeDeletionPlan(planAccountDeletion(facts())).consequences,
    ).toEqual([
      "Your personal workspace is deleted, with your themes, settings and integrations.",
      "You're signed out on every device.",
    ]);
  });
});

describe("confirmation and re-authentication", () => {
  it('accepts "delete" typed in any case, and nothing else', () => {
    expect(isDeleteConfirmed("delete")).toBe(true);
    expect(isDeleteConfirmed("  DELETE ")).toBe(true);
    expect(isDeleteConfirmed("delet")).toBe(false);
    expect(isDeleteConfirmed("delete my account")).toBe(false);
  });

  it("asks for an emailed code wherever codes can be delivered", () => {
    // Production with email set up
    expect(
      canDeliverSignInCodes({
        nodeEnv: "production",
        deliveryAllowed: true,
        emailConfigured: true,
      }),
    ).toBe(true);
    // Production without email: no codes
    expect(
      canDeliverSignInCodes({
        nodeEnv: "production",
        deliveryAllowed: true,
        emailConfigured: false,
      }),
    ).toBe(false);
    // Preview deployments never send email and never log codes
    expect(
      canDeliverSignInCodes({
        nodeEnv: "production",
        deliveryAllowed: false,
        emailConfigured: true,
      }),
    ).toBe(false);
    // Local development logs codes to the server console
    expect(
      canDeliverSignInCodes({
        nodeEnv: "development",
        deliveryAllowed: false,
        emailConfigured: false,
      }),
    ).toBe(true);
  });

  it("otherwise needs a sign-in from the last 10 minutes", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(isRecentSignIn(new Date("2026-11-01T11:51:00Z"), now)).toBe(true);
    expect(isRecentSignIn(new Date("2026-11-01T11:49:00Z"), now)).toBe(false);
  });
});

describe("profile picture keys", () => {
  const USER = "XfcZwfKTTDITD9CGR2LUVIRfF2ZxCgIA";
  const KEY = avatarKey(USER, "ckabc123def456ghi789jkl0m", "image/webp");

  it("builds keys under avatars/<user>/", () => {
    expect(KEY).toBe(`avatars/${USER}/ckabc123def456ghi789jkl0m.webp`);
    expect(isAvatarKey(KEY)).toBe(true);
    expect(isAvatarKey(`avatars/${USER}/../secret.webp`)).toBe(false);
    expect(isAvatarKey(`avatars/${USER}/x.svg`)).toBe(false);
    expect(isAvatarKey(`u-${USER}/file/x.png`)).toBe(false);
  });

  it("finds the key behind this user's uploaded pictures only", () => {
    expect(avatarKeyFromImage(`https://cdn.qrdx.dev/${KEY}`, USER)).toBe(KEY);
    expect(avatarKeyFromImage(`https://qrdx.dev/api/${KEY}`, USER)).toBe(KEY);
    // Someone else's key, a Google picture, or nothing: never touched.
    expect(
      avatarKeyFromImage(`https://cdn.qrdx.dev/${KEY}`, "other"),
    ).toBeNull();
    expect(
      avatarKeyFromImage("https://lh3.googleusercontent.com/a/abc=s96-c", USER),
    ).toBeNull();
    expect(avatarKeyFromImage(null, USER)).toBeNull();
    expect(avatarKeyFromImage("not a url", USER)).toBeNull();
  });

  it("falls back to initials", () => {
    expect(initialsOf("Ada Lovelace", "ada@example.com")).toBe("AL");
    expect(initialsOf("ada", "ada@example.com")).toBe("A");
    expect(initialsOf("  ", "zed@example.com")).toBe("Z");
    expect(initialsOf("Émile Zola Jr", "e@example.com")).toBe("ÉJ");
  });
});
