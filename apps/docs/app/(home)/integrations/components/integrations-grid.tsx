"use client";

import { cn } from "@repo/design-system/lib/utils";
import type {
  IntegrationCategory,
  IntegrationDefinition,
} from "@repo/integrations";
import { BadgeCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  analytics: "Analytics",
  storage: "Storage",
  assets: "Assets",
  marketing: "Marketing",
  crm: "CRM",
  communication: "Communication",
};

const CATEGORY_ORDER: IntegrationCategory[] = [
  "analytics",
  "storage",
  "assets",
  "marketing",
  "crm",
  "communication",
];

type FilterTab = "all" | IntegrationCategory;

interface IntegrationsGridProps {
  integrations: IntegrationDefinition[];
  showFilter?: boolean;
}

export function IntegrationsGrid({
  integrations,
  showFilter = true,
}: IntegrationsGridProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const availableCategories = CATEGORY_ORDER.filter((cat) =>
    integrations.some((i) => i.category.includes(cat)),
  );

  const filtered =
    activeTab === "all"
      ? integrations
      : integrations.filter((i) => i.category.includes(activeTab));

  return (
    <section className="w-full border-y">
      {showFilter && (
        <div className="flex border-b overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "border-r px-5 py-3 text-sm font-medium transition-colors shrink-0",
              activeTab === "all"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            All
          </button>
          {availableCategories.map((cat) => (
            <button
              type="button"
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={cn(
                "border-r px-5 py-3 text-sm font-medium transition-colors shrink-0",
                activeTab === cat
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No integrations in this category yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((integration) => (
            <IntegrationCard key={integration.slug} integration={integration} />
          ))}
        </div>
      )}
    </section>
  );
}

export function IntegrationCard({
  integration,
}: {
  integration: IntegrationDefinition;
}) {
  return (
    <Link
      href={`/integrations/${integration.slug}`}
      className="group relative flex flex-col gap-4 border-b border-r p-5 transition-colors hover:bg-muted/20"
    >
      {/* Coming Soon badge */}
      {!integration.configurable && (
        <span className="absolute right-3 top-3 rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
          Soon
        </span>
      )}

      {/* Logo */}
      <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-white p-2.5 shrink-0">
        {integration.logo ? (
          <img
            src={integration.logo}
            alt={`${integration.name} logo`}
            className="size-full object-contain"
          />
        ) : (
          <ExternalLink className="size-5 text-muted-foreground" />
        )}
      </div>

      {/* Name + badge */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold leading-tight">
            {integration.name}
          </span>
          {integration.configurable && (
            <BadgeCheck className="size-4 shrink-0 text-amber-500" />
          )}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {integration.description}
        </p>
      </div>
    </Link>
  );
}
