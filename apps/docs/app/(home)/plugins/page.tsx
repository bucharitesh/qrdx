import { GithubLogo, Info } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  getCatalogEntry,
  type IntegrationCatalogEntry,
} from "@repo/integrations/src/catalog";
import { ExportSquare } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import { CodeSnippet } from "@/components/sections/integrations/code-snippet";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import {
  CardGrid,
  LinkCard,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { TrackedLink } from "@/lib/analytics/react";
import { createMetadata } from "@/lib/metadata";
import { PLUGINS, type PluginInfo, REQUEST_PLUGIN_URL } from "./plugin-data";
import {
  CanvaMock,
  ChromeMock,
  FigmaMock,
  RaycastMock,
} from "./plugin-mockups";

const pageMetadata = createMetadata({
  title: "QR code plugins for Chrome, Figma, Raycast and Canva",
  description:
    "Make styled QR codes without leaving your tools: a Chrome extension for the page you're on, a Figma plugin that inserts vector codes, a Raycast extension and a Canva app. Free, open source, no account.",
  path: "/plugins",
});
// No `images` key, so this page's own opengraph-image.tsx is used instead
// of the site-wide default that createMetadata fills in.
const { images: _defaultImages, ...openGraph } = pageMetadata.openGraph ?? {};

export const metadata: Metadata = { ...pageMetadata, openGraph };

const MOCKS: Record<PluginInfo["slug"], ComponentType> = {
  chrome: ChromeMock,
  figma: FigmaMock,
  raycast: RaycastMock,
  canva: CanvaMock,
};

interface Plugin extends PluginInfo {
  entry: IntegrationCatalogEntry;
}

const plugins: Plugin[] = PLUGINS.flatMap((info) => {
  const entry = getCatalogEntry(info.slug);
  return entry ? [{ ...info, entry }] : [];
});

const faqs = [
  {
    question: "Why install from source?",
    answer:
      "None of the four is in its store yet. Until then, each one builds from the open-source QRdx repository in a few commands; the steps are on this page and in each plugin's folder on GitHub.",
  },
  {
    question: "Do I need a QRdx account?",
    answer:
      "No. The plugins are free and work without an account. Open in QRdx in the Chrome extension opens the full editor at qrdx.dev, where you can sign in for dynamic codes you can edit after printing.",
  },
  {
    question: "Do the plugins send my data anywhere?",
    answer:
      "The Chrome extension and the Figma plugin make no network requests: codes are drawn on your device by the qrdx library. The Raycast extension keeps saved codes in Raycast's local storage, and Generate QR with AI sends your description to Raycast AI. The Canva app draws the code in its panel and adds it to your design as an image.",
  },
  {
    question: "Can I change a code after adding it?",
    answer:
      "In Figma, select it and click Edit QR code, or use Replace selected QR to keep its size and position. In Raycast, saved codes can be edited and exported again. In Chrome and Canva, make a new code; for printed codes whose link you want to change later, use a dynamic code from the QRdx dashboard.",
  },
];

const inkButtonClass =
  "border-transparent bg-black text-white shadow-none hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90";

function PluginSection({ plugin, index }: { plugin: Plugin; index: number }) {
  const { entry } = plugin;
  const Mock = MOCKS[plugin.slug];
  const headingId = `${plugin.slug}-heading`;
  const flip = index % 2 === 1;

  return (
    <section
      id={plugin.slug}
      aria-labelledby={headingId}
      className="flex scroll-mt-20 flex-col gap-10 px-6 py-14 md:px-10 md:py-20"
    >
      <div
        className={cn(
          "grid items-center gap-10 lg:gap-14",
          // The mockup always gets the wider column, on either side.
          flip
            ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
            : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
        )}
      >
        <div
          className={cn("flex min-w-0 flex-col gap-6", flip && "lg:order-2")}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <IntegrationLogo logo={entry.logo} />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {plugin.kind}
              </p>
            </div>
            <h2
              id={headingId}
              className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
            >
              {entry.name}
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
              {entry.tagline}
            </p>
          </div>

          <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {entry.capabilities.map((capability) => (
              <li
                key={capability.title}
                className="flex flex-col gap-1 border-t pt-3"
              >
                <h3 className="text-sm font-medium text-foreground">
                  {capability.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {capability.description}
                </p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Runs on</p>
            <ul className="flex flex-wrap gap-1.5">
              {plugin.platforms.map((platform) => (
                <li
                  key={platform}
                  className="rounded-full border px-2.5 py-0.5 text-xs text-foreground/80"
                >
                  {platform}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2.5">
              {plugin.storeUrl ? (
                <Button asChild className={inkButtonClass}>
                  <TrackedLink
                    event="plugin_install_clicked"
                    props={{ plugin: plugin.slug, target: "store" }}
                    href={plugin.storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get it on the {plugin.store}
                    <ExportSquare aria-hidden className="size-4 opacity-70" />
                  </TrackedLink>
                </Button>
              ) : (
                <Button asChild className={inkButtonClass}>
                  <TrackedLink
                    event="plugin_install_clicked"
                    props={{ plugin: plugin.slug, target: "source" }}
                    href={plugin.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GithubLogo aria-hidden className="size-4" />
                    Install from source
                  </TrackedLink>
                </Button>
              )}
              <Button asChild variant="outline">
                <a href={`#${plugin.slug}-install`}>Setup steps</a>
              </Button>
            </div>
            {!plugin.storeUrl && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info aria-hidden className="size-4 shrink-0" />
                Not in the {plugin.store} yet.
              </p>
            )}
          </div>
        </div>

        <div className={cn("min-w-0", flip && "lg:order-1")}>
          <div className="rounded-2xl border bg-muted/30 p-3 sm:p-6 md:p-8">
            <Mock />
          </div>
        </div>
      </div>

      <div
        id={`${plugin.slug}-install`}
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-medium">Install from source</h3>
          <a
            href={plugin.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            plugins/{plugin.slug} on GitHub
            <ExportSquare aria-hidden className="size-3.5" />
          </a>
        </div>
        <ol
          className={cn(
            "grid divide-y rounded-2xl border bg-card shadow-xs md:divide-x md:divide-y-0 dark:shadow-none",
            entry.steps.length === 2
              ? "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
              : "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)]",
          )}
        >
          {entry.steps.map((step, stepIndex) => (
            <li
              key={step.title}
              className="flex min-w-0 flex-col gap-3 p-4 md:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border bg-muted/40 font-mono text-xs text-foreground/80">
                  {stepIndex + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1 pt-0.5">
                  <h4 className="text-sm font-medium leading-snug">
                    {step.title}
                  </h4>
                  {step.body && (
                    <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                      {step.body}
                    </p>
                  )}
                </div>
              </div>
              {step.snippet && (
                <CodeSnippet
                  code={step.snippet.code}
                  label={step.snippet.label}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function PluginsPage() {
  return (
    <main className="flex min-h-screen w-full flex-col divide-y divide-border">
      <ToolHero
        pattern="halo"
        focus={[0.5, 0.3]}
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Plugins", path: "/plugins" },
        ]}
        title="QR codes inside the apps you already use"
        intro={[
          "Make a code for the page you're on in Chrome, insert vector codes into a Figma design, generate one from the Raycast launcher, or add one to a Canva design. All four are free and open source, and none needs a QRdx account.",
        ]}
      >
        <nav aria-label="Plugins">
          <ul className="flex flex-wrap justify-center gap-2">
            {plugins.map((plugin) => (
              <li key={plugin.slug}>
                <a
                  href={`#${plugin.slug}`}
                  className="flex h-10 items-center gap-2 rounded-full border bg-background/80 py-1 pr-4 pl-1.5 text-sm font-medium backdrop-blur-sm transition-colors hover:border-foreground/15 hover:bg-accent"
                >
                  <IntegrationLogo logo={plugin.entry.logo} size="sm" />
                  {plugin.entry.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-muted-foreground">
          Free · No account · Open source (AGPL-3.0)
        </p>
      </ToolHero>

      {plugins.map((plugin, index) => (
        <PluginSection key={plugin.slug} plugin={plugin} index={index} />
      ))}

      <section
        aria-labelledby="more"
        className="flex flex-col gap-8 px-6 py-14 md:px-10 md:py-16"
      >
        <SectionHeading
          id="more"
          eyebrow="More ways to use QRdx"
          title="Not the app you work in?"
          description={
            <>
              Ask an AI assistant, connect the tools your team uses, or build on
              the API. Missing a plugin?{" "}
              <a
                href={REQUEST_PLUGIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={textLinkClass}
              >
                Request one
              </a>
              .
            </>
          }
        />
        <CardGrid count={3}>
          <LinkCard
            href="/mcp"
            title="AI assistants"
            description="Claude, ChatGPT, Cursor and VS Code make QR codes over the free MCP server."
          />
          <LinkCard
            href="/integrations"
            title="Integrations"
            description="Zapier, Make, Discord, analytics pixels and the other tools QRdx connects to."
          />
          <LinkCard
            href="/docs/developers/build-an-integration"
            title="Build your own integration"
            description="The REST API, webhooks and OAuth apps, for a plugin of your own."
          />
        </CardGrid>
        <p className="text-sm text-muted-foreground">
          Prefer code? The{" "}
          <Link href="/docs/getting-started" className={textLinkClass}>
            qrdx React library
          </Link>{" "}
          that powers every plugin is on npm.
        </p>
      </section>

      <FaqList title="Plugins FAQ" faqs={faqs} />
    </main>
  );
}
