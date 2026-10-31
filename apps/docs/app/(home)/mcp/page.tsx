import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight2,
  ColorSwatch,
  Location,
  MessageText,
  Personalcard,
  ScanBarcode,
  Sms,
  TickCircle,
  Wifi,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { McpTerminal } from "@/components/mockups/mcp-terminal";
import {
  type CardIcon,
  IconTile,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { mcpServerUrl } from "@/lib/mcp-clients";
import { baseUrl, createMetadata } from "@/lib/metadata";
import {
  McpConnect,
  McpConnectView,
  McpPromptGallery,
  McpPromptGalleryView,
} from "./mcp-connect";

export const metadata: Metadata = createMetadata({
  title: "QR Code MCP Server for Claude, ChatGPT, Cursor and VS Code",
  description:
    "Connect Claude, ChatGPT, Cursor, VS Code or any MCP app to the free QRdx MCP server in one click, then generate styled QR codes and Wi-Fi, vCard, email, SMS and location payloads. No account or API key.",
  path: "/mcp",
});

const MCP_URL = mcpServerUrl(baseUrl);
const PAGE_URL = new URL("/mcp", baseUrl).toString();

const steps: { title: string; body: string }[] = [
  {
    title: "Add the server",
    body: "One command or a few lines of config in Claude, Cursor, VS Code or any other MCP app. No account or API key.",
  },
  {
    title: "Ask your assistant",
    body: "In plain words: the link or details to encode, colors and shape. It picks the right QRdx tool.",
  },
  {
    title: "Get a QR code back",
    body: "A PNG image in the chat, plus SVG, PNG and EPS links ready for Markdown, HTML or print.",
  },
];

const tools: {
  name: string;
  title: string;
  description: string;
  icon: CardIcon;
}[] = [
  {
    name: "generate_qr_code",
    title: "Generate a QR code",
    description:
      "Renders the code and returns a PNG image plus public SVG, PNG and EPS image URLs ready for Markdown or HTML. Takes the image API options: colors, body, eye and dot shapes, error correction, margin and frame. Set include_svg for the SVG markup.",
    icon: ScanBarcode,
  },
  {
    name: "list_qr_styles",
    title: "List styles",
    description:
      "Body patterns, corner eye and eye dot shapes, frame templates, error correction levels, defaults and limits.",
    icon: ColorSwatch,
  },
  {
    name: "qr_payload_wifi",
    title: "Wi-Fi network",
    description:
      "A WIFI: payload (WPA, WEP or open, optionally hidden) with special characters escaped.",
    icon: Wifi,
  },
  {
    name: "qr_payload_vcard",
    title: "Contact card",
    description:
      "A vCard 3.0 contact: name, organization, title, phones, email, website, address and note.",
    icon: Personalcard,
  },
  {
    name: "qr_payload_email",
    title: "Email",
    description: "A mailto: link with optional cc, bcc, subject and body.",
    icon: Sms,
  },
  {
    name: "qr_payload_sms",
    title: "Text message",
    description:
      "An sms: link with an optional message, or the older SMSTO: form.",
    icon: MessageText,
  },
  {
    name: "qr_payload_geo",
    title: "Map location",
    description: "A geo: location from latitude and longitude.",
    icon: Location,
  },
];

const faqs = [
  {
    question: "Do I need an account or an API key?",
    answer:
      "No. The QRdx MCP server is public and free. It needs no account or API key and keeps no session state.",
  },
  {
    question: "Which AI tools does it work with?",
    answer:
      "Any MCP app that supports remote servers over Streamable HTTP, such as Claude, ChatGPT (in developer mode), Claude Code, Cursor, VS Code, Windsurf, Gemini CLI and Codex. Apps that only run local stdio servers can connect through the mcp-remote bridge.",
  },
  {
    question: "Can it add logos or gradients?",
    answer:
      "No. Like the image API, the MCP server renders solid colors only. For logos and gradients, design the code in the QRdx playground or render it with the qrdx React library.",
  },
  {
    question: "Can it create dynamic QR codes?",
    answer:
      "No. The MCP tools render static QR codes and format payloads. Dynamic codes, whose destination you can change later, are created in the QRdx dashboard or with the REST API.",
  },
  {
    question: "Does QRdx store the codes I generate?",
    answer:
      "No. The tools only render images and format text. They don't read or change any QRdx account data, and the server doesn't save the codes. The image URLs it returns contain the encoded data, so don't share them if the data is private, such as a Wi-Fi password.",
  },
  {
    question: "Are there limits?",
    answer:
      "Requests are limited to 120 per minute per IP address. Very long data may not fit in a QR code; the tool then returns an error suggesting a lower error correction level.",
  },
  {
    question: "Can I run it myself?",
    answer:
      "Yes. The MCP server is part of the QRdx web app, so a self-hosted instance serves it at /api/mcp on your own domain.",
  },
];

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
        intro={[
          "MCP (Model Context Protocol) is the open standard that lets AI assistants use outside tools. Connect QRdx once, ask for a QR code in plain words, and get the image back in the chat.",
        ]}
      >
        <Suspense fallback={<McpConnectView url={MCP_URL} tab="claude" />}>
          <McpConnect url={MCP_URL} />
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
        </div>
      </ToolHero>

      <section
        aria-labelledby="prompts"
        className="flex w-full flex-col gap-8 px-6 py-12 md:px-10 md:py-16"
      >
        <SectionHeading
          id="prompts"
          eyebrow="Try it"
          title="Prompts to start with"
          description="Each one uses what the QRdx tools really do: colors and shapes, Wi-Fi, contacts, email, SMS and map payloads, and SVG, PNG or EPS links. Open it in your assistant or copy it."
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
        className="grid w-full gap-10 px-6 py-12 md:px-10 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center"
      >
        <div className="flex min-w-0 flex-col gap-8">
          <SectionHeading
            id="how"
            eyebrow="How it works"
            title="Three steps, then just ask"
            description="Your assistant calls the QRdx tools for you. You never touch an API."
          />
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
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
        className="flex w-full flex-col gap-8 px-6 py-12 md:px-10 md:py-16"
      >
        <SectionHeading
          id="tools"
          eyebrow="Tools"
          title="What your assistant can call"
          description={
            <>
              Seven read-only tools. They render images and format text, and
              never read or change QRdx account data. Full parameters are in the{" "}
              <Link href="/docs/developers/mcp" className={textLinkClass}>
                MCP server docs
              </Link>
              .
            </>
          }
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, index) => (
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

      <FaqList title="MCP server FAQ" faqs={faqs} />
    </main>
  );
}
