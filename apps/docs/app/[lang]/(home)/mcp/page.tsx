import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight2, TickCircle } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ClientContent } from "@/components/i18n/client-content";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink as Link, LocaleLink } from "@/components/i18n/locale-link";
import { McpTerminal } from "@/components/mockups/mcp-terminal";
import {
  IconTile,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { MCP_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { localizeHref } from "@/lib/i18n/paths";
import { requireLocale } from "@/lib/i18n/server";
import { mcpLocalUrl, mcpMoreClients, mcpServerUrl } from "@/lib/mcp-clients";
import { baseUrl } from "@/lib/metadata";
import { playgroundHref } from "@/lib/playground-links";
import {
  MCP_FAQS,
  MCP_INTRO,
  MCP_PROMPTS,
  MCP_STEPS,
  MCP_TOOLS,
} from "./content";
import {
  McpConnect,
  McpConnectView,
  McpPromptGallery,
  McpPromptGalleryView,
} from "./mcp-connect";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "mcp" });
  return localizedMetadata({
    locale,
    path: "/mcp",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
    alternates: {
      types: { "text/markdown": new URL("/mcp.md", baseUrl).toString() },
    },
  });
}

/** Copy the client components show from ./content.ts and lib/mcp-clients. */
const CLIENT_CONTENT = {
  prompts: MCP_PROMPTS,
  clients: mcpMoreClients(mcpServerUrl(baseUrl)),
};

const MCP_URL = mcpServerUrl(baseUrl);
/** Only in local dev: this instance's own endpoint, shown as a hint. */
const LOCAL_MCP_URL = mcpLocalUrl(baseUrl);

export default async function McpPage() {
  const locale = await requireLocale();
  const [t, common, content] = await Promise.all([
    getTranslations({ locale, namespace: "mcp" }),
    getTranslations({ locale, namespace: "common" }),
    localizeContent(
      { intro: MCP_INTRO, steps: MCP_STEPS, tools: MCP_TOOLS, faqs: MCP_FAQS },
      locale,
      MCP_RULES,
    ),
  ]);
  const pageUrl = new URL(localizeHref("/mcp", locale), baseUrl).toString();
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="qr"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: "/mcp" },
        ]}
        title={t("title")}
        intro={[content.intro]}
      >
        <ClientMessages namespaces={["mcp.connect"]}>
          <ClientContent data={CLIENT_CONTENT}>
            <Suspense
              fallback={
                <McpConnectView
                  url={MCP_URL}
                  localUrl={LOCAL_MCP_URL}
                  tab="claude"
                />
              }
            >
              <McpConnect url={MCP_URL} localUrl={LOCAL_MCP_URL} />
            </Suspense>
          </ClientContent>
        </ClientMessages>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <ul className="contents">
            {(["free", "noKey", "readOnly"] as const).map((fact) => (
              <li key={fact} className="inline-flex items-center gap-1.5">
                <TickCircle aria-hidden className="size-3.5" />
                {t(`facts.${fact}`)}
              </li>
            ))}
          </ul>
          <Link
            href="/docs/developers/mcp"
            className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t("docs")}
            <ArrowRight2 aria-hidden className="size-3.5" />
          </Link>
          <LocaleLink
            href={playgroundHref({ open: "code", lang: "mcp" })}
            className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t("playground")}
            <ArrowRight2 aria-hidden className="size-3.5" />
          </LocaleLink>
        </div>
      </ToolHero>

      <section
        aria-labelledby="prompts"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="prompts"
          eyebrow={t("promptsEyebrow")}
          title={t("promptsTitle")}
          description={t("promptsDescription")}
        />
        <ClientMessages namespaces={["mcp.connect"]}>
          <ClientContent data={CLIENT_CONTENT}>
            <Suspense
              fallback={
                <McpPromptGalleryView
                  url={MCP_URL}
                  pageUrl={pageUrl}
                  tab="claude"
                />
              }
            >
              <McpPromptGallery url={MCP_URL} pageUrl={pageUrl} />
            </Suspense>
          </ClientContent>
        </ClientMessages>
      </section>

      <section
        aria-labelledby="how"
        className="grid w-full gap-10 px-10 py-12 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center"
      >
        <div className="flex min-w-0 flex-col gap-8">
          <SectionHeading
            id="how"
            eyebrow={t("howEyebrow")}
            title={t("howTitle")}
            description={t("howDescription")}
          />
          <ol className="flex flex-col gap-3">
            {content.steps.map((step, index) => (
              <li key={step.title}>
                <Card className="flex-row gap-4 p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40 font-mono text-sm text-foreground/80">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="font-medium text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                      {step.body}
                    </p>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </div>
        <McpTerminal mcpUrl={MCP_URL} />
      </section>

      <section
        aria-labelledby="tools"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="tools"
          eyebrow={t("toolsEyebrow")}
          title={t("toolsTitle")}
          description={t.rich("toolsDescription", {
            count: MCP_TOOLS.length,
            link: (chunks) => (
              <Link href="/docs/developers/mcp" className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {content.tools.map((tool, index) => (
            <li
              key={tool.name}
              className={cn(
                "min-w-0",
                index === 0 && "sm:col-span-2 lg:col-span-3",
              )}
            >
              <Card
                className={cn(
                  "h-full gap-3 p-5",
                  index === 0 && "lg:flex-row lg:items-start lg:gap-5",
                )}
              >
                <IconTile icon={tool.icon} />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="font-medium text-foreground">
                      {tool.title}
                    </h3>
                    <code className="rounded-full border bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {tool.name}
                    </code>
                  </div>
                  <p
                    className={cn(
                      "text-sm leading-relaxed text-muted-foreground text-pretty",
                      index === 0 && "max-w-3xl",
                    )}
                  >
                    {tool.description}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <FaqList title={t("faqTitle")} faqs={content.faqs} />
    </main>
  );
}
