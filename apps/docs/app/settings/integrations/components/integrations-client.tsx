"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { getCapabilityLabel } from "@repo/integration-kit";
import type { IntegrationDefinition } from "@repo/integrations";
import {
  getCatalogEntry,
  type IntegrationCatalogEntry,
} from "@repo/integrations/src/catalog";
import { ArrowRight, SearchNormal1 } from "iconsax-reactjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  IntegrationLogo,
  logoForIntegration,
} from "@/components/sections/integrations/integration-logo";
import { IntegrationCard } from "./integration-card";

export type IntegrationWithStatus = IntegrationDefinition & {
  isConfigured: boolean;
  isConnected: boolean;
  status?: "active" | "disconnected" | "error";
  metadata?: any;
  connectedAt?: Date;
};

/** Built-in integrations are set up where they live in the app. */
const SHORTCUTS: {
  title: string;
  description: string;
  href: string;
  slugs: string[];
}[] = [
  {
    title: "Slack, Discord and email alerts",
    description:
      "Scan milestones, form responses and code changes, plus a weekly digest.",
    href: "/settings/notifications",
    slugs: ["slack", "discord", "email-alerts"],
  },
  {
    title: "Webhooks, Zapier, Make and n8n",
    description:
      "Send scans, form responses and code changes to your own tools.",
    href: "/dashboard/webhooks",
    slugs: ["webhooks", "zapier", "make", "n8n"],
  },
  {
    title: "Tracking pixels",
    description:
      "Google Analytics, Tag Manager, Meta, TikTok and LinkedIn on hosted pages.",
    href: "/dashboard/codes",
    slugs: [
      "google-analytics",
      "google-tag-manager",
      "meta-pixel",
      "tiktok-pixel",
      "linkedin-insight-tag",
    ],
  },
  {
    title: "Custom domains",
    description: "Serve your dynamic codes' short links from your own domain.",
    href: "/dashboard/domains",
    slugs: ["custom-domains"],
  },
  {
    title: "AI assistants",
    description:
      "Make QR codes from Claude, ChatGPT, Cursor and more over MCP.",
    href: "/integrations?category=ai",
    slugs: ["claude", "chatgpt", "cursor"],
  },
];

function matches(text: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || text.some((value) => value.toLowerCase().includes(q));
}

interface IntegrationsClientProps {
  integrations: IntegrationWithStatus[];
}

export function IntegrationsClient({ integrations }: IntegrationsClientProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      integrations.filter((i) =>
        matches([i.name, i.description, ...i.features], search),
      ),
    [integrations, search],
  );

  const shortcuts = useMemo(
    () =>
      SHORTCUTS.map((shortcut) => ({
        ...shortcut,
        entries: shortcut.slugs
          .map((slug) => getCatalogEntry(slug))
          .filter((entry): entry is IntegrationCatalogEntry => Boolean(entry)),
      })).filter((shortcut) =>
        matches(
          [
            shortcut.title,
            shortcut.description,
            ...shortcut.entries.map((entry) => entry.name),
          ],
          search,
        ),
      ),
    [search],
  );

  const connected = filtered.filter((i) => i.isConnected);
  const nothing = filtered.length === 0 && shortcuts.length === 0;

  return (
    <div className="space-y-8">
      <div className="relative">
        <SearchNormal1
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Search integrations"
          aria-label="Search integrations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {connected.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Connected ({connected.length})
          </h2>
          <Card className="gap-0 overflow-hidden p-0 shadow-xs dark:shadow-none">
            {connected.map((integration) => (
              <Link
                key={integration.slug}
                href={`/settings/integrations/${integration.slug}`}
                className="group flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/40"
              >
                <IntegrationLogo
                  logo={logoForIntegration(integration.slug, integration.logos)}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">
                    {integration.name}
                  </span>
                  <p className="truncate text-muted-foreground text-xs">
                    {integration.capabilities
                      .map((capability) => getCapabilityLabel(capability.kind))
                      .join(", ")}
                  </p>
                </div>
                <ArrowRight
                  aria-hidden
                  className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </Card>
        </section>
      )}

      {filtered.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Connect an account
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((integration) => (
              <IntegrationCard
                key={integration.slug}
                slug={integration.slug}
                name={integration.name}
                description={integration.description}
                logos={integration.logos}
                capabilities={integration.capabilities}
                isConnected={integration.isConnected}
                isConfigured={integration.isConfigured}
              />
            ))}
          </div>
        </section>
      )}

      {shortcuts.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Built into QRdx
            </h2>
            <Link
              href="/integrations"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All integrations
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
          <Card className="gap-0 overflow-hidden p-0 shadow-xs dark:shadow-none">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.title}
                href={shortcut.href}
                className="group flex items-center gap-4 border-b px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent/40"
              >
                <span className="flex shrink-0 -space-x-2">
                  {shortcut.entries.slice(0, 3).map((entry, index) => (
                    <IntegrationLogo
                      key={entry.slug}
                      logo={entry.logo}
                      size="sm"
                      className={cn(
                        "ring-2 ring-card",
                        index > 0 && "hidden sm:grid",
                      )}
                    />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{shortcut.title}</span>
                  <p className="text-muted-foreground text-xs leading-relaxed text-pretty">
                    {shortcut.description}
                  </p>
                </div>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </Card>
        </section>
      )}

      {nothing && (
        <Card className="items-center gap-3 px-6 py-10 text-center shadow-xs dark:shadow-none">
          <p className="text-sm text-muted-foreground">
            No integrations match &ldquo;{search.trim()}&rdquo;.
          </p>
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Clear search
          </Button>
        </Card>
      )}
    </div>
  );
}
