/**
 * Account deletion, decided before anything is deleted. Pure: the facts are
 * loaded by ./deletion-server.ts, and the same plan drives the page (what
 * will happen) and the delete action (what to do).
 *
 * Teams keep working without you. In every team where other people remain,
 * the content you created there (codes, pages, files, themes, domains,
 * folders, tags, webhooks) goes to the member who takes over: another owner
 * if there is one, else the senior admin, else the longest-standing member.
 * When you are the team's only owner, that person becomes an owner first,
 * and deletion stops if that fails. Teams where you are the only member are
 * deleted with your account.
 */

import { SUPPORT_EMAIL } from "@repo/config";
export const DELETE_CONFIRMATION = "delete";

export function isDeleteConfirmed(text: string): boolean {
  return text.trim().toLowerCase() === DELETE_CONFIRMATION;
}

const ROLE_RANK: Record<string, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  billing: 3,
  viewer: 4,
};

/**
 * Best rank among comma-separated roles ("owner,admin" ranks as owner), each
 * matched exactly like Better Auth does: " owner" ranks as nothing.
 */
export function roleRank(role: string | null | undefined): number {
  if (!role) return 5;
  return Math.min(
    ...role
      .split(",")
      .map((value) => (Object.hasOwn(ROLE_RANK, value) ? ROLE_RANK[value] : 5)),
  );
}

export function roleLabel(role: string): string {
  const rank = roleRank(role);
  return ["owner", "admin", "member", "billing", "viewer"][rank] ?? "member";
}

export interface TeamMemberFacts {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface TeamFacts {
  organizationId: string;
  name: string;
  /** The user's role, or null when they left but still created content there */
  role: string | null;
  /** Everyone else in the team */
  others: TeamMemberFacts[];
}

export interface SubscriptionFacts {
  status: string;
  /** "Pro", "Business" */
  planName: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface DeletionFacts {
  teams: TeamFacts[];
  /** The user's entitled (active or trialing) subscription, if any */
  subscription: SubscriptionFacts | null;
  /** Polar is configured, so a subscription can be cancelled */
  billingConfigured: boolean;
  personal: { codes: number; pages: number; files: number; domains: number };
}

export interface Successor {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

export type TeamPlan =
  | {
      organizationId: string;
      name: string;
      /** Other people remain: your team content goes to `successor` */
      action: "hand-over";
      successor: Successor;
      /** You are the only owner, so `successor` is made an owner first */
      promote: boolean;
    }
  | {
      organizationId: string;
      name: string;
      /** You are the only member: the team is deleted */
      action: "delete-team";
    }
  | {
      organizationId: string;
      name: string;
      /** You left this team and nobody is in it: your content there is deleted */
      action: "none";
    };

export interface DeletionPlan {
  teams: TeamPlan[];
  subscription: (SubscriptionFacts & { cancel: true }) | null;
  /** Reasons deletion can't go ahead right now; empty when it can */
  blockers: string[];
  personal: DeletionFacts["personal"];
}

/** Another owner first, then the senior admin, then the longest-standing member. */
export function pickSuccessor(
  others: readonly TeamMemberFacts[],
): TeamMemberFacts | null {
  const [best] = [...others].sort(
    (a, b) =>
      roleRank(a.role) - roleRank(b.role) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.memberId.localeCompare(b.memberId),
  );
  return best ?? null;
}

export function planAccountDeletion(facts: DeletionFacts): DeletionPlan {
  const teams = facts.teams.map((team): TeamPlan => {
    const successor = pickSuccessor(team.others);
    if (successor) {
      return {
        organizationId: team.organizationId,
        name: team.name,
        action: "hand-over",
        successor: {
          memberId: successor.memberId,
          userId: successor.userId,
          name: successor.name,
          email: successor.email,
          role: successor.role,
        },
        promote: roleRank(team.role) === 0 && roleRank(successor.role) !== 0,
      };
    }
    return {
      organizationId: team.organizationId,
      name: team.name,
      action: team.role ? "delete-team" : "none",
    };
  });

  const blockers: string[] = [];
  if (facts.subscription && !facts.billingConfigured) {
    blockers.push(
      `Your ${facts.subscription.planName} subscription can't be cancelled from here right now. Cancel it under Settings → Plan & usage first, or email ${SUPPORT_EMAIL}.`,
    );
  }

  return {
    teams,
    subscription: facts.subscription
      ? { ...facts.subscription, cancel: true }
      : null,
    blockers,
    personal: facts.personal,
  };
}

/** What deleting does, in plain sentences for the page and the dialog. */
export interface DeletionSummary {
  blockers: string[];
  consequences: string[];
}

/**
 * Whether this deployment can deliver a sign-in code (the same rules as
 * lib/auth/sign-in-code-delivery.ts): emailed where outbound delivery is on,
 * written to the server console in local development, otherwise not at all.
 * Without codes, deleting needs a recent sign-in instead.
 */
export function canDeliverSignInCodes({
  nodeEnv,
  deliveryAllowed,
  emailConfigured,
}: {
  nodeEnv: string | undefined;
  deliveryAllowed: boolean;
  emailConfigured: boolean;
}): boolean {
  if (deliveryAllowed && nodeEnv !== "test") return emailConfigured;
  return nodeEnv !== "production";
}

/** Without email codes, the session must be this fresh to delete the account. */
export const RECENT_SIGN_IN_MS = 10 * 60 * 1000;

export function isRecentSignIn(sessionCreatedAt: Date, now: Date): boolean {
  return now.getTime() - sessionCreatedAt.getTime() <= RECENT_SIGN_IN_MS;
}
