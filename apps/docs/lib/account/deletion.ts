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

export const DELETE_CONFIRMATION = "delete";

export function isDeleteConfirmed(text: string): boolean {
  return text.trim().toLowerCase() === DELETE_CONFIRMATION;
}

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** Best rank among comma-separated roles ("owner,admin" ranks as owner). */
export function roleRank(role: string | null | undefined): number {
  if (!role) return 3;
  return Math.min(
    ...role.split(",").map((value) => ROLE_RANK[value.trim()] ?? 3),
  );
}

export function roleLabel(role: string): string {
  const rank = roleRank(role);
  return rank === 0 ? "owner" : rank === 1 ? "admin" : "member";
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
      `Your ${facts.subscription.planName} subscription can't be cancelled from here right now. Cancel it under Usage & billing first, or email support@qrdx.dev.`,
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

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString("en")} ${count === 1 ? one : many}`;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What deleting does, in plain sentences for the page and the dialog. */
export interface DeletionSummary {
  blockers: string[];
  consequences: string[];
}

export function describeDeletionPlan(plan: DeletionPlan): DeletionSummary {
  const { codes, pages, files, domains } = plan.personal;
  const counted = [
    codes > 0 ? plural(codes, "code") : null,
    pages > 0 ? plural(pages, "hosted page") : null,
    files > 0 ? plural(files, "file") : null,
    domains > 0 ? plural(domains, "custom domain") : null,
  ].filter((item): item is string => item !== null);

  const consequences = [
    counted.length > 0
      ? `Your personal workspace is deleted, with its ${listOf(counted)}, plus your scans, themes, webhooks and integrations.${codes > 0 ? ` Its printed QR codes show a "QR code not found" page.` : ""}`
      : "Your personal workspace is deleted, with your themes, settings and integrations.",
  ];

  for (const team of plan.teams) {
    if (team.action === "hand-over") {
      const who = team.successor.name || team.successor.email;
      consequences.push(
        team.promote
          ? `${team.name}: ${who} (${roleLabel(team.successor.role)}) becomes an owner and takes over what you created in the team, so its codes keep working.`
          : `${team.name}: what you created in the team stays with it, under ${who}.`,
      );
    } else if (team.action === "delete-team") {
      consequences.push(
        `${team.name}: you're the only member, so the team and its content are deleted.`,
      );
    }
  }

  if (plan.subscription) {
    consequences.push(
      `Your ${plan.subscription.planName} subscription is cancelled straight away.`,
    );
  }
  consequences.push("You're signed out on every device.");

  return { blockers: plan.blockers, consequences };
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
