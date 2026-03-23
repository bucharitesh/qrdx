import type { IntegrationCategory } from "@repo/integrations";
import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/sections/section-header";
import { IntegrationCard } from "../components/integrations-grid";

initializeIntegrations();

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  analytics: "Analytics",
  storage: "Storage",
  assets: "Assets",
  marketing: "Marketing",
  crm: "CRM",
  communication: "Communication",
};

interface IntegrationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: IntegrationPageProps) {
  const { slug } = await params;
  initializeIntegrations();
  const registry = getIntegrationRegistry();
  const integration = registry.get(slug);
  if (!integration) return {};
  return {
    title: `${integration.name} Integration | QRdx`,
    description: integration.description,
  };
}

export default async function IntegrationDetailPage({
  params,
}: IntegrationPageProps) {
  const { slug } = await params;

  const registry = getIntegrationRegistry();
  const integration = registry.get(slug);

  if (!integration) notFound();

  const allIntegrations = registry.getAll();
  const popular = allIntegrations.filter((i) => i.slug !== slug).slice(0, 6);

  const installSteps = [
    `Click "${integration.configurable ? "Connect" : "Enable"}" to start the OAuth authorization flow`,
    `You'll be redirected to ${integration.name} to grant QRdx the required permissions`,
    `Once authorized, you'll be sent back to QRdx and the integration will be active immediately`,
  ];

  return (
    <main className="w-full min-h-screen divide-y divide-border mt-20">
      {/* Breadcrumb bar */}
      <div className="px-8 md:px-10 py-3">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          Browse all
        </Link>
      </div>

      {/* Two-column body */}
      <div className="flex flex-col lg:flex-row lg:divide-x divide-border px-6">
        {/* ── Left sidebar ── */}
        <aside className="w-full md:w-72 shrink-0 flex flex-col gap-8 p-6">
          {/* Logo */}
          <div className="bg-white border border-border flex size-20 items-center justify-center rounded-full p-3.5 shadow-sm">
            {integration.logo ? (
              <img
                src={integration.logo}
                alt={`${integration.name} logo`}
                className="size-full object-contain"
              />
            ) : (
              <ExternalLink className="size-8 text-muted-foreground" />
            )}
          </div>

          {/* Name + badge */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {integration.name}
            </h1>
            {!integration.configurable && (
              <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-0.5 text-xs font-semibold text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
                Coming Soon
              </span>
            )}
          </div>

          {/* CTA */}
          {integration.configurable ? (
            <Link
              href={`/settings/integrations/${integration.slug}`}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-foreground text-background text-sm font-semibold transition-colors hover:bg-foreground/90"
            >
              Connect to QRdx
            </Link>
          ) : (
            <span className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-muted-foreground cursor-not-allowed select-none">
              Coming Soon
            </span>
          )}

          {/* Meta */}
          <div className="flex flex-col gap-5 text-sm">
            {integration.developedBy && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Built by
                </p>
                <p className="font-medium">{integration.developedBy}</p>
              </div>
            )}

            {integration.category.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Category
                </p>
                <p className="font-medium">
                  {integration.category
                    .map((c) => CATEGORY_LABELS[c])
                    .join(", ")}
                </p>
              </div>
            )}

            {integration.website && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Website
                </p>
                <a
                  href={integration.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground hover:underline underline-offset-4"
                >
                  {new URL(integration.website).hostname}
                </a>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 space-y-10 p-6 md:p-10">
          {/* Description */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">
              Description
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              {integration.description}
            </p>
          </div>

          {/* Features */}
          {integration.features.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">Features</h2>
              <p className="text-sm text-muted-foreground">
                The following capabilities are supported.
              </p>
              <ul className="space-y-2.5 mt-2">
                {integration.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <span className="size-1.5 rounded-full bg-foreground/40 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* How to install */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">
              How to install
            </h2>
            <ol className="space-y-3 mt-2">
              {installSteps.map((step, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: ordered steps
                <li key={idx} className="flex items-start gap-3 text-sm">
                  <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                    {idx + 1}
                  </span>
                  <span className="text-muted-foreground leading-relaxed">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Popular integrations */}
      {popular.length > 0 && (
        <section className="flex flex-col items-center justify-center gap-10 w-full relative px-6 pb-40">
          <SectionHeader>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance">
              Popular integrations
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium text-sm">
              The most connected tools in the QRdx ecosystem.
            </p>
          </SectionHeader>
          <div className="grid w-full max-w-7xl grid-cols-2 md:grid-cols-3 overflow-hidden border-y border-border items-center justify-center z-20">
            {popular.map((item) => (
              <IntegrationCard key={item.slug} integration={item} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
