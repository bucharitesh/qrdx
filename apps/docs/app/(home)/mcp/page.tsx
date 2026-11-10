import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight2, TickCircle } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { McpTerminal } from "@/components/mockups/mcp-terminal";
import {
  IconTile,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { mcpLocalUrl, mcpServerUrl } from "@/lib/mcp-clients";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { playgroundHref } from "@/lib/playground-links";
import { MCP_FAQS, MCP_INTRO, MCP_STEPS, MCP_TOOLS } from "./content";
import {
  McpConnect,
  McpConnectView,
  McpPromptGallery,
  McpPromptGalleryView,
} from "./mcp-connect";

export const metadata: Metadata = createMetadata({
  title: "QR Code MCP Server for Claude, ChatGPT and Cursor",
  description:
    "Connect Claude, ChatGPT, Cursor, VS Code or any MCP app to the free QRdx MCP server and make styled QR codes, Wi-Fi, vCard and more. No account or API key.",
  path: "/mcp",
  ownOgImage: true,
  alternates: {
    types: { "text/markdown": new URL("/mcp.md", baseUrl).toString() },
  },
});

const MCP_URL = mcpServerUrl(baseUrl);
/** Only in local dev: this instance's own endpoint, shown as a hint. */
const LOCAL_MCP_URL = mcpLocalUrl(baseUrl);
const PAGE_URL = new URL("/mcp", baseUrl).toString();

export default function McpPage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="qr"
        crumbs={[
          { name: "Home", path: "/" },
          { name: "MCP server", path: "/mcp" },
        ]}
        title="Make QR codes from your AI assistant"
        intro={[MCP_INTRO]}
      >
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
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <ul className="contents">
            {["Free", "No account or API key", "Read-only tools"].map(
              (fact) => (
                <li key={fact} className="inline-flex items-center gap-1.5">
                  <TickCircle aria-hidden className="size-3.5" />
                  {fact}
                </li>
              ),
            )}
          </ul>
          <Link
            href="/docs/developers/mcp"
            className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            MCP docs
            <ArrowRight2 aria-hidden className="size-3.5" />
          </Link>
          <Link
            href={playgroundHref({ open: "code", lang: "mcp" })}
            className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Try it in the playground
            <ArrowRight2 aria-hidden className="size-3.5" />
          </Link>
        </div>
      </ToolHero>

      <section
        aria-labelledby="prompts"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="prompts"
          eyebrow="Try it"
          title="Prompts to start with"
          description="Each one uses what the QRdx tools really do: colors and shapes, Wi-Fi, contacts, email, SMS and map payloads, and SVG, PNG, WebP or EPS links. Open it in your assistant or copy it."
        />
        <Suspense
          fallback={
            <McpPromptGalleryView
              url={MCP_URL}
              pageUrl={PAGE_URL}
              tab="claude"
            />
          }
        >
          <McpPromptGallery url={MCP_URL} pageUrl={PAGE_URL} />
        </Suspense>
      </section>

      <section
        aria-labelledby="how"
        className="grid w-full gap-10 px-10 py-12 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center"
      >
        <div className="flex min-w-0 flex-col gap-8">
          <SectionHeading
            id="how"
            eyebrow="How it works"
            title="Three steps, then just ask"
            description="Your assistant calls the QRdx tools for you. You never touch an API."
          />
          <ol className="flex flex-col gap-3">
            {MCP_STEPS.map((step, index) => (
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
          eyebrow="Tools"
          title="What your assistant can call"
          description={
            <>
              {MCP_TOOLS.length} tools. All but save_template and save_barcode
              are read-only and need no key: they render images, format text and
              read the public community. Full parameters are in the{" "}
              <Link href="/docs/developers/mcp" className={textLinkClass}>
                MCP server docs
              </Link>
              .
            </>
          }
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MCP_TOOLS.map((tool, index) => (
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

      <FaqList title="MCP server FAQ" faqs={MCP_FAQS} />
    </main>
  );
}
