import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HairlineFigure } from "@/components/mockups/hairline";
import { McpTerminal } from "@/components/mockups/mcp-terminal";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { CopySnippetButton } from "./copy-snippet";

export const metadata: Metadata = createMetadata({
  title: "QR Code MCP Server for Claude, Cursor and VS Code",
  description:
    "Connect Claude, Cursor, VS Code or any MCP client to the free QRdx MCP server to generate styled QR codes and Wi-Fi, vCard, email, SMS and location payloads. No account or API key.",
  path: "/mcp",
});

const MCP_URL = new URL("/api/mcp", baseUrl).toString();

const json = (value: unknown) => JSON.stringify(value, null, 2);

const clients = [
  {
    name: "Claude Code",
    where: "Run this in your terminal:",
    code: `claude mcp add --transport http qrdx ${MCP_URL}`,
  },
  {
    name: "Cursor",
    where:
      "Add the server to ~/.cursor/mcp.json (all projects) or .cursor/mcp.json (one project):",
    code: json({ mcpServers: { qrdx: { url: MCP_URL } } }),
  },
  {
    name: "VS Code",
    where: "Add the server to .vscode/mcp.json in your workspace:",
    code: json({ servers: { qrdx: { type: "http", url: MCP_URL } } }),
  },
  {
    name: "Other clients",
    where: `Clients that support remote (Streamable HTTP) servers only need the URL ${MCP_URL}. For clients that only run local stdio servers, bridge it with mcp-remote:`,
    code: json({
      mcpServers: {
        qrdx: { command: "npx", args: ["-y", "mcp-remote", MCP_URL] },
      },
    }),
  },
];

const tools = [
  {
    name: "generate_qr_code",
    description:
      "Renders a QR code. Returns a PNG image and public image API URLs (SVG and PNG) ready for Markdown or HTML, plus the SVG markup on request.",
  },
  {
    name: "list_qr_styles",
    description:
      "Lists body patterns, corner eye and eye dot shapes, frame templates, error correction levels, defaults and limits.",
  },
  {
    name: "qr_payload_wifi",
    description:
      "Builds a WIFI: network payload (WPA, WEP or open, optionally hidden) with special characters escaped.",
  },
  {
    name: "qr_payload_vcard",
    description:
      "Builds a vCard 3.0 contact (RFC 2426): name, organization, title, phones, email, website, address and note.",
  },
  {
    name: "qr_payload_email",
    description:
      "Builds a mailto: link (RFC 6068) with optional cc, bcc, subject and body.",
  },
  {
    name: "qr_payload_sms",
    description:
      "Builds an sms: link (RFC 5724) with an optional message, or the older SMSTO: form.",
  },
  {
    name: "qr_payload_geo",
    description:
      "Builds a geo: location (RFC 5870) from latitude and longitude.",
  },
];

const prompts = [
  "Make a QR code for https://example.com in our brand blue, #155dfc, with rounded modules.",
  "Create a Wi-Fi QR code for the network Office Guest with password correct-horse-battery.",
  "Generate a contact QR code for Ada Lovelace, ada@example.com, and add it to the README.",
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
      "Any MCP client that supports remote servers over Streamable HTTP, such as Claude Code, Cursor and VS Code. Clients that only run local stdio servers can connect through the mcp-remote bridge.",
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
        crumbs={[
          { name: "Home", path: "/" },
          { name: "MCP server", path: "/mcp" },
        ]}
        title="QRdx MCP server"
        intro={[
          "Generate styled QR codes and Wi-Fi, vCard, email, SMS and geo payloads from Claude, Cursor, VS Code and any other MCP client. Ask in plain language and your assistant gets back a PNG image plus SVG and PNG links you can drop into Markdown or HTML. The server is free, public and needs no API key.",
        ]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <Link href="/docs/developers/mcp">
              Read the setup guide
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/docs/developers/image-api">Image API</Link>
          </Button>
        </div>
      </ToolHero>

      <section
        aria-label="Example MCP session"
        className="w-full px-6 md:px-10 py-10"
      >
        <div className="grid items-center gap-8 rounded-2xl border border-border bg-muted/40 px-3 py-8 sm:px-8 md:px-12 md:py-12 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <McpTerminal mcpUrl={MCP_URL} />
          <HairlineFigure
            figure="Plug"
            className="hidden aspect-square w-full lg:block"
          />
        </div>
      </section>

      <section
        aria-labelledby="install"
        className="w-full px-6 md:px-10 py-10 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <h2
            id="install"
            className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          >
            Install
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The server runs at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {MCP_URL}
            </code>{" "}
            over the Streamable HTTP transport. Pick your client:
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((client) => (
            <div
              key={client.name}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-secondary-foreground">
                  {client.name}
                </h3>
                <CopySnippetButton
                  text={client.code}
                  label={`${client.name} config`}
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {client.where}
              </p>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                <code>{client.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="ask"
        className="w-full px-6 md:px-10 py-10 flex flex-col gap-4"
      >
        <h2
          id="ask"
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
        >
          Then just ask
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {prompts.map((prompt) => (
            <li
              key={prompt}
              className="rounded-xl border border-border bg-accent/50 p-4 text-sm text-muted-foreground leading-relaxed"
            >
              “{prompt}”
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground leading-relaxed">
          For Wi-Fi, contacts, email, SMS and locations, the assistant first
          builds the payload with the matching tool, then passes it to{" "}
          <code className="font-mono text-xs">generate_qr_code</code>.
        </p>
      </section>

      <section
        aria-labelledby="tools"
        className="w-full px-6 md:px-10 py-10 flex flex-col gap-4"
      >
        <h2
          id="tools"
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
        >
          Tools
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Tool
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tools.map((tool) => (
                <tr key={tool.name}>
                  <td className="px-4 py-3 align-top">
                    <code className="font-mono text-xs whitespace-nowrap">
                      {tool.name}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground leading-relaxed">
                    {tool.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <code className="font-mono text-xs">generate_qr_code</code> takes the
          same options as the{" "}
          <Link
            href="/docs/developers/image-api#parameters"
            className="underline"
          >
            image API
          </Link>
          : <code className="font-mono text-xs">data</code> (required), size,
          colors, body, eye and dot patterns, error correction level, margin and
          frame template. All tools are read-only. Full details are in the{" "}
          <Link href="/docs/developers/mcp" className="underline">
            MCP server docs
          </Link>
          .
        </p>
      </section>

      <FaqList title="MCP server FAQ" faqs={faqs} />
    </main>
  );
}
