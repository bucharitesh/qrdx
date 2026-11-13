// The deletion plan (./deletion.ts) in sentences, in the app's language.
// Server-only: it carries the English catalog for its default translator,
// which the page's client components must not bundle.
import "server-only";

import { createTranslator } from "use-intl/core";
import type { Messages } from "@/lib/i18n/messages";
import en from "@/messages/en.json";
import { type DeletionPlan, type DeletionSummary, roleLabel } from "./deletion";

export type DeletionTranslator = ReturnType<
  typeof createTranslator<Messages, "app.settings.account.deletion">
>;

const ENGLISH = createTranslator({
  locale: "en",
  messages: en,
  namespace: "app.settings.account.deletion",
});

/**
 * The plan in sentences, in the app's language (`t`; English by default).
 * Counts and roles are ICU plurals and selects in the catalog.
 */
export function describeDeletionPlan(
  plan: DeletionPlan,
  t: DeletionTranslator = ENGLISH,
  locale = "en",
): DeletionSummary {
  const { codes, pages, files, domains } = plan.personal;
  const counted = [
    codes > 0 ? t("counts.codes", { count: codes }) : null,
    pages > 0 ? t("counts.pages", { count: pages }) : null,
    files > 0 ? t("counts.files", { count: files }) : null,
    domains > 0 ? t("counts.domains", { count: domains }) : null,
  ].filter((item): item is string => item !== null);
  // House style has no serial comma ("codes, pages and domains").
  const list = new Intl.ListFormat(locale === "en" ? "en-GB" : locale, {
    type: "conjunction",
  }).format(counted);

  const consequences = [
    counted.length === 0
      ? t("workspaceEmpty")
      : codes > 0
        ? t("workspaceWithCodes", { list })
        : t("workspaceWith", { list }),
  ];

  for (const team of plan.teams) {
    if (team.action === "hand-over") {
      const who = team.successor.name || team.successor.email;
      consequences.push(
        team.promote
          ? t("teamPromote", {
              team: team.name,
              who,
              role: roleLabel(team.successor.role),
            })
          : t("teamStays", { team: team.name, who }),
      );
    } else if (team.action === "delete-team") {
      consequences.push(t("teamDeleted", { team: team.name }));
    }
  }

  if (plan.subscription) {
    consequences.push(
      t("subscriptionCancelled", { plan: plan.subscription.planName }),
    );
  }
  consequences.push(t("signedOut"));

  // The only blocker today is a subscription that can't be cancelled here
  // (planAccountDeletion keeps the English one for server errors).
  const blockers =
    plan.blockers.length > 0 && plan.subscription
      ? [t("subscriptionBlocker", { plan: plan.subscription.planName })]
      : plan.blockers;
  return { blockers, consequences };
}
