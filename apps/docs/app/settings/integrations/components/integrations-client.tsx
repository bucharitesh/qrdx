"use client";

import { Input } from "@repo/design-system/components/ui/input";
import type {
  IntegrationCategory,
  IntegrationDefinition,
} from "@repo/integrations";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { IntegrationCard } from "./integration-card";

export type IntegrationWithStatus = IntegrationDefinition & {
  isConfigured: boolean;
  isConnected: boolean;
  status?: "active" | "disconnected" | "error";
  metadata?: any;
  connectedAt?: Date;
};

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

function matchesSearch(
  integration: IntegrationDefinition,
  query: string,
): boolean {
  const q = query.toLowerCase();
  return (
    integration.name.toLowerCase().includes(q) ||
    integration.description.toLowerCase().includes(q) ||
    integration.features.some((f) => f.toLowerCase().includes(q))
  );
}

interface IntegrationsClientProps {
  integrations: IntegrationWithStatus[];
}

export function IntegrationsClient({ integrations }: IntegrationsClientProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return integrations;
    return integrations.filter((i) => matchesSearch(i, search));
  }, [integrations, search]);

  const enabledIntegrations = useMemo(
    () => filtered.filter((i) => i.isConnected),
    [filtered],
  );

  // Group integrations by primary category (first category in the array)
  const byCategory = useMemo(() => {
    const map = new Map<IntegrationCategory, IntegrationWithStatus[]>();
    for (const integration of filtered) {
      const primaryCategory = integration.category[0];
      if (!primaryCategory) continue;
      if (!map.has(primaryCategory)) {
        map.set(primaryCategory, []);
      }
      map.get(primaryCategory)!.push(integration);
    }
    return map;
  }, [filtered]);

  const orderedCategories = CATEGORY_ORDER.filter((cat) => byCategory.has(cat));

  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Enabled integrations */}
      {enabledIntegrations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Enabled integrations
            </h3>
            <span className="text-xs text-muted-foreground">
              View all ({enabledIntegrations.length})
            </span>
          </div>
          <div className="space-y-1 rounded-lg border bg-card overflow-hidden">
            {enabledIntegrations.map((integration) => (
              <Link
                key={integration.slug}
                href={`/settings/integrations/${integration.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
              >
                <div className="bg-white border border-border flex size-8 items-center justify-center rounded-md p-1.5 shrink-0">
                  {integration.logo ? (
                    <img
                      src={integration.logo}
                      alt={`${integration.name} logo`}
                      className="size-full object-contain"
                    />
                  ) : (
                    <div className="size-full bg-muted rounded" />
                  )}
                </div>
                <span className="flex-1 text-sm font-medium">
                  {integration.name}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No integrations found for &ldquo;{search}&rdquo;
          </p>
        </div>
      )}

      {/* Category sections */}
      {orderedCategories.map((category) => {
        const items = byCategory.get(category)!;
        return (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-semibold">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((integration) => (
                <IntegrationCard
                  key={integration.slug}
                  slug={integration.slug}
                  name={integration.name}
                  description={integration.description}
                  logo={integration.logo}
                  isConnected={integration.isConnected}
                  isConfigured={integration.isConfigured}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
