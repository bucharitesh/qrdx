"use client";

import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  ArrowLeft,
  ArrowRight,
  Code,
  Code1,
  Coffee,
  Copy,
  DocumentDownload,
  Element3,
  ExportSquare,
  type Icon,
  Location,
  MessageText,
  Personalcard,
  SearchNormal1,
  Sms,
  TableDocument,
  TicketStar,
  Wifi,
} from "iconsax-reactjs";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import {
  CHATGPT_CONNECTORS_URL,
  chatgptChatUrl,
  claudeChatUrl,
  claudeCodeCommand,
  claudeConnectorUrl,
  cursorInstallUrl,
  MCP_CLIENT_IDS,
  MCP_CLIENT_LOGOS,
  MCP_CLIENT_LOGOS_DARK,
  MCP_CLIENT_NAMES,
  MCP_MORE_CLIENT_IDS,
  type McpClientId,
  type McpMoreClient,
  type McpMoreClientId,
  mcpConfigSnippets,
  mcpMoreClients,
  vscodeInstallRedirectUrl,
  vscodeInstallUrl,
} from "@/lib/mcp-clients";

type AnyClientId = McpClientId | McpMoreClientId;

const ALL_CLIENT_IDS = [...MCP_CLIENT_IDS, ...MCP_MORE_CLIENT_IDS] as const;
const tabParser = parseAsStringLiteral(ALL_CLIENT_IDS);
const STORAGE_KEY = "qrdx:mcp-client";

const isMainClient = (id: string | null): id is McpClientId =>
  (MCP_CLIENT_IDS as readonly string[]).includes(id ?? "");
const isMoreClient = (id: string | null): id is McpMoreClientId =>
  (MCP_MORE_CLIENT_IDS as readonly string[]).includes(id ?? "");

/**
 * The selected AI app, kept in ?tab= (like /mcp?tab=cursor) and remembered
 * in localStorage for the next visit.
 */
export function useMcpTab() {
  const [tab, setTab] = useQueryState(
    "tab",
    tabParser.withOptions({ scroll: false }),
  );

  // No ?tab=: restore the last client picked on this device.
  useEffect(() => {
    if (tab) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isMainClient(stored)) void setTab(stored, { history: "replace" });
    } catch {}
  }, [tab, setTab]);

  const select = (id: AnyClientId | null) => {
    void setTab(id);
    if (!id) return;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  return [tab, select] as const;
}

/** Plays a UI sound through the site's sound engine (no-op when it is off). */
function playSound(name: "copy") {
  window.dispatchEvent(new CustomEvent("qrdx:sound", { detail: name }));
}

/** Copies text, shows a toast, and briefly swaps the icon for a tick. */
function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (text: string, message: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        playSound("copy");
        toast.success(message);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
      },
      () => toast.error("Couldn't copy. Select the text and copy it instead."),
    );
  };
  return { copied, copy };
}

function CopyButton({
  text,
  label,
  message,
  variant = "ghost",
  children,
  className,
}: {
  text: string;
  /** Accessible name, e.g. "server URL". */
  label: string;
  message: string;
  variant?: "ghost" | "outline" | "secondary" | "default";
  children?: ReactNode;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      className={cn("shrink-0", className)}
      onClick={() => copy(text, message)}
      aria-label={children ? undefined : `Copy ${label}`}
    >
      {copied ? (
        <Tick
          aria-hidden
          className="size-4 text-emerald-600 dark:text-emerald-400"
        />
      ) : (
        <Copy aria-hidden className="size-4" />
      )}
      {children ?? (copied ? "Copied" : "Copy")}
    </Button>
  );
}

/**
 * A client's bare logo mark. Black marks swap to their white version in dark
 * mode; "Other" gets a neutral icon.
 */
export function ClientLogo({
  client,
  className,
}: {
  client: McpClientId;
  className?: string;
}) {
  const src = MCP_CLIENT_LOGOS[client];
  const dark = MCP_CLIENT_LOGOS_DARK[client];
  const img = "size-full object-contain";

  return (
    <span
      className={cn(
        "grid size-5 shrink-0 grid-cols-1 grid-rows-1 place-items-center",
        className,
      )}
    >
      {!src ? (
        <Element3 aria-hidden className="size-full text-muted-foreground" />
      ) : dark ? (
        <>
          <img src={src} alt="" className={cn(img, "dark:hidden")} />
          <img src={dark} alt="" className={cn(img, "hidden dark:block")} />
        </>
      ) : (
        <img src={src} alt="" className={img} />
      )}
    </span>
  );
}

interface Snippet {
  file: string;
  code: string;
  wrap?: boolean;
  /** Hide the copy button (when the main action already copies it). */
  noCopy?: boolean;
}

function CodeBlock({ file, code, wrap, noCopy }: Snippet) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-muted/40 text-left">
      <div className="flex items-center justify-between gap-2 border-b py-1 pr-1 pl-3">
        <span className="truncate font-mono text-xs text-muted-foreground">
          {file}
        </span>
        {noCopy ? (
          <span className="h-8" />
        ) : (
          <CopyButton text={code} label={file} message="Copied" />
        )}
      </div>
      <pre
        className={cn(
          "p-3 font-mono text-xs leading-relaxed text-foreground sm:p-4",
          wrap
            ? "whitespace-pre-wrap [overflow-wrap:anywhere]"
            : "overflow-x-auto",
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface ClientSetup {
  title: string;
  lead: string;
  action?: ReactNode;
  steps: ReactNode[];
  extra?: ReactNode;
}

type Brand =
  | "claude"
  | "chatgpt"
  | "cursor"
  | "vscode"
  | "windsurf"
  | "gemini"
  | "codex";

/**
 * Brand colours for the one-click buttons only (the rest of the page stays
 * neutral). Text colours pass 4.5:1 on each fill, light and dark.
 */
const BRANDS: Record<Brand, { className: string; logo: string }> = {
  claude: {
    // Claude coral with Anthropic's near-black text (white fails contrast).
    className:
      "bg-[#D97757] text-[#141413] hover:bg-[#D97757] dark:text-[#141413]",
    logo: "/integrations/claude.svg",
  },
  chatgpt: {
    className:
      "bg-black text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-white",
    logo: "/integrations/chatgpt.svg",
  },
  cursor: {
    className:
      "bg-black text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-white",
    logo: "/integrations/cursor.svg",
  },
  vscode: {
    className: "bg-[#007ACC] text-white hover:bg-[#007ACC] dark:text-white",
    logo: "/integrations/vscode.svg",
  },
  windsurf: {
    className:
      "bg-[#0B100F] text-white hover:bg-[#0B100F] dark:bg-white dark:text-[#0B100F] dark:hover:bg-white",
    logo: "/integrations/windsurf.svg",
  },
  gemini: {
    className: "bg-[#1A73E8] text-white hover:bg-[#1A73E8] dark:text-white",
    logo: "/integrations/gemini.svg",
  },
  codex: {
    className:
      "bg-black text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-white",
    logo: "/integrations/codex.svg",
  },
};

/** The brand's logo file drawn in the button's text colour. */
function BrandMark({ logo }: { logo: string }) {
  const mask = `url(${logo}) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 bg-current"
      style={{ mask, WebkitMask: mask }}
    />
  );
}

const brandMotion =
  "shadow-none transition-[filter,transform] duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:brightness-95 dark:hover:brightness-95 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/**
 * The core Button in a client's brand colours: a link (`href`) or an action
 * (`onClick`), with the client's logo mark and an optional extra glyph.
 */
function BrandConnectButton({
  brand,
  href,
  external,
  onClick,
  glyph,
  children,
}: {
  brand: Brand;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  glyph?: ReactNode;
  children: ReactNode;
}) {
  const { className, logo } = BRANDS[brand];
  const handleClick = () => {
    track("mcp_connect_clicked", { client: brand });
    onClick?.();
  };
  const content = (
    <>
      <BrandMark logo={logo} />
      {glyph}
      {children}
      {external && <ExportSquare aria-hidden className="size-4 opacity-70" />}
    </>
  );

  if (href) {
    return (
      <Button asChild className={cn(className, brandMotion)}>
        <a
          href={href}
          onClick={handleClick}
          {...(external && { target: "_blank", rel: "noopener noreferrer" })}
        >
          {content}
        </a>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      onClick={handleClick}
      className={cn(className, brandMotion)}
    >
      {content}
    </Button>
  );
}

/** Copies `text` and plays the copy sound; for button-style brand actions. */
function BrandCopyButton({
  brand,
  text,
  message,
  glyph,
  children,
}: {
  brand: Brand;
  text: string;
  message: string;
  glyph?: ReactNode;
  children: ReactNode;
}) {
  const { copied, copy } = useCopy();
  return (
    <BrandConnectButton
      brand={brand}
      glyph={glyph}
      onClick={() => copy(text, message)}
    >
      {copied ? "Copied" : children}
    </BrandConnectButton>
  );
}

/** Link to a client's connector settings that also copies the server URL. */
function OpenWithCopy({
  brand,
  href,
  text,
  message,
  children,
}: {
  brand: Brand;
  href: string;
  text: string;
  message: string;
  children: ReactNode;
}) {
  const { copy } = useCopy();
  return (
    <BrandConnectButton
      brand={brand}
      href={href}
      external
      onClick={() => copy(text, message)}
    >
      {children}
    </BrandConnectButton>
  );
}

function setups(url: string): Record<McpClientId, ClientSetup> {
  const snippets = mcpConfigSnippets(url);
  const command = claudeCodeCommand(url);

  return {
    claude: {
      title: "Make QR codes in Claude with QRdx",
      lead: "One click opens Claude's Add connector dialog with QRdx and the server URL already filled in. Click Add and ask for a QR code.",
      action: (
        <OpenWithCopy
          brand="claude"
          href={claudeConnectorUrl(url)}
          text={url}
          message="Opening Claude. The URL is also copied, just in case."
        >
          Connect to Claude
        </OpenWithCopy>
      ),
      steps: [
        "Click Connect to Claude. Claude opens Customize → Connectors with the Add custom connector dialog already filled in (name QRdx, the server URL).",
        "Check the details and leave the advanced (OAuth) fields empty: the server needs no sign-in. If the fields are empty, paste the URL (it's on your clipboard) and name it QRdx.",
        "Click Add, then turn QRdx on from the tools menu of a chat.",
        "Ask for a QR code. Free Claude plans can add one custom connector; on Team and Enterprise plans an owner adds it for the organization.",
      ],
    },
    chatgpt: {
      title: "Make QR codes in ChatGPT with QRdx",
      lead: "One click copies the server URL and opens ChatGPT's settings. Custom connectors run in ChatGPT's developer mode.",
      action: (
        <OpenWithCopy
          brand="chatgpt"
          href={CHATGPT_CONNECTORS_URL}
          text={url}
          message="URL copied. Paste it in ChatGPT."
        >
          Connect to ChatGPT
        </OpenWithCopy>
      ),
      steps: [
        "Click Connect to ChatGPT. The server URL is copied and ChatGPT opens its settings.",
        "In Apps & Connectors, open Advanced settings and turn on Developer mode. On Business and Enterprise workspaces an admin may need to allow it first.",
        "Click Create, name it QRdx, paste the URL as the MCP server URL, choose No authentication and create it.",
        "In a new chat, pick Developer mode from the + menu, switch on QRdx and ask for a QR code. Availability depends on your ChatGPT plan.",
      ],
    },
    "claude-code": {
      title: "Make QR codes in Claude Code with QRdx",
      lead: "Run one command in your terminal. The server is then available in every Claude Code session.",
      action: (
        <BrandCopyButton
          brand="claude"
          text={command}
          message="Command copied. Run it in your terminal."
          glyph={<Code aria-hidden className="size-4" />}
        >
          Copy install command
        </BrandCopyButton>
      ),
      extra: <CodeBlock file="Terminal" code={`$ ${command}`} wrap noCopy />,
      steps: [
        "Click Copy install command and run it in your terminal.",
        "Start Claude Code and run /mcp to check that qrdx is connected.",
        "Ask for a QR code. Claude Code can also save the image or the SVG into your project.",
      ],
    },
    cursor: {
      title: "Make QR codes in Cursor with QRdx",
      lead: "One click opens Cursor with the QRdx server ready to install.",
      action: (
        <BrandConnectButton brand="cursor" href={cursorInstallUrl(url)}>
          Add to Cursor
        </BrandConnectButton>
      ),
      extra: <CodeBlock {...snippets.cursor} />,
      steps: [
        "Click Add to Cursor and allow the browser to open Cursor.",
        "Cursor shows the qrdx server: click Install.",
        "Check it is switched on under Cursor Settings → MCP, then ask the agent for a QR code.",
        "Prefer config files? Add the snippet above to ~/.cursor/mcp.json for all projects, or .cursor/mcp.json for one.",
      ],
    },
    vscode: {
      title: "Make QR codes in VS Code with QRdx",
      lead: "One click opens VS Code's install page for the QRdx server. Use it from Copilot Chat in agent mode.",
      action: (
        <>
          <BrandConnectButton
            brand="vscode"
            href={vscodeInstallRedirectUrl(url)}
            external
          >
            Install in VS Code
          </BrandConnectButton>
          <Button asChild variant="ghost" size="sm">
            <a href={vscodeInstallUrl(url)}>Open VS Code directly</a>
          </Button>
        </>
      ),
      extra: <CodeBlock {...snippets.vscode} />,
      steps: [
        "Click Install in VS Code. The page hands over to VS Code, which shows the qrdx server.",
        "Click Install.",
        "In Copilot Chat, switch to agent mode, open the tools picker, make sure qrdx is on and ask for a QR code.",
        "Prefer config files? Add the snippet above to .vscode/mcp.json in your workspace.",
      ],
    },
    windsurf: {
      title: "Make QR codes in Windsurf with QRdx",
      lead: "Copy the config into Windsurf's MCP settings. Cascade can then call the QRdx tools.",
      action: (
        <BrandCopyButton
          brand="windsurf"
          text={snippets.windsurf.code}
          message="Windsurf config copied."
        >
          Copy Windsurf config
        </BrandCopyButton>
      ),
      extra: <CodeBlock {...snippets.windsurf} />,
      steps: [
        "Click Copy Windsurf config.",
        "In Windsurf, open the MCP settings from the Cascade panel (or edit ~/.codeium/windsurf/mcp_config.json) and paste it. Merge it into mcpServers if you already have servers.",
        "Refresh the MCP servers, check qrdx is on, then ask Cascade for a QR code.",
      ],
    },
  };
}

/**
 * The server URL with a copy button. In local dev it also points to this
 * instance's own endpoint, for trying server changes before they ship.
 */
function ServerUrlField({
  url,
  localUrl,
}: {
  url: string;
  localUrl?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2 rounded-full border bg-muted/30 py-1 pr-1 pl-4">
        <span className="sr-only">Server URL:</span>
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
          {url}
        </code>
        <CopyButton text={url} label="server URL" message="URL copied." />
      </div>
      {localUrl && localUrl !== url && (
        <p className="px-4 text-xs text-muted-foreground text-pretty">
          Testing locally? Use{" "}
          <code className="font-mono whitespace-nowrap text-foreground/80 select-all">
            {localUrl}
          </code>
        </p>
      )}
    </div>
  );
}

function ConnectPanel({
  client,
  url,
  localUrl,
  setup,
}: {
  client: McpClientId;
  url: string;
  localUrl?: string | null;
  setup: ClientSetup;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5 p-5 text-left sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
          <ClientLogo client={client} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-balance">
            {setup.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {setup.lead}
          </p>
        </div>
      </div>

      {setup.action && (
        <div className="flex flex-wrap items-center gap-2">{setup.action}</div>
      )}

      <ServerUrlField url={url} localUrl={localUrl} />

      {setup.extra}

      <details className="group rounded-xl border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          How to connect?
          <ArrowDown2
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        <ol className="flex flex-col gap-3 border-t px-4 py-4">
          {setup.steps.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-muted/40 font-mono text-xs text-foreground/80">
                {index + 1}
              </span>
              <span className="leading-relaxed text-muted-foreground text-pretty">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

/** Client tabs with a one-click connect action for each AI app. */
export function McpConnect({
  url,
  localUrl,
}: {
  url: string;
  /** This instance's own endpoint in local dev (see mcpLocalUrl). */
  localUrl?: string | null;
}) {
  const [tab, select] = useMcpTab();
  // The main panel keeps showing the last main tab while the picker is open.
  const [lastMain, setLastMain] = useState<McpClientId>("claude");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastMore, setLastMore] = useState<McpMoreClientId | null>(null);

  useEffect(() => {
    if (isMainClient(tab)) setLastMain(tab);
    if (isMoreClient(tab)) {
      setLastMore(tab);
      setPickerOpen(true);
    }
  }, [tab]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isMoreClient(stored)) setLastMore(stored);
    } catch {}
  }, []);

  const current = isMainClient(tab) ? tab : lastMain;
  const picked = isMoreClient(tab) ? tab : null;

  return (
    <McpConnectView
      url={url}
      localUrl={localUrl}
      tab={current}
      onTabChange={select}
      more={
        <MoreClients
          url={url}
          localUrl={localUrl}
          open={pickerOpen}
          selected={picked}
          lastUsed={lastMore}
          onOpenChange={(open) => {
            setPickerOpen(open);
            if (!open && picked) select(current);
          }}
          onSelect={(id) => select(id ?? current)}
        />
      }
    />
  );
}

/**
 * The connect card for a given tab. Also the server-rendered fallback (Claude
 * selected) while the ?tab= value is read on the client.
 */
export function McpConnectView({
  url,
  localUrl,
  tab,
  onTabChange,
  more,
}: {
  url: string;
  localUrl?: string | null;
  tab: McpClientId;
  onTabChange?: (tab: McpClientId) => void;
  /** The "More clients" trigger and picker (client only). */
  more?: ReactNode;
}) {
  const all = setups(url);
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the selected tab visible when the tab row scrolls (phones).
  useEffect(() => {
    const row = scroller.current;
    const active = row?.querySelector<HTMLElement>(`[data-client="${tab}"]`);
    if (!row || !active) return;
    const left = active.offsetLeft - 16;
    const right = active.offsetLeft + active.offsetWidth - row.clientWidth + 24;
    if (row.scrollLeft > left) row.scrollLeft = left;
    else if (row.scrollLeft < right) row.scrollLeft = right;
  }, [tab]);

  return (
    <Card className="w-full max-w-4xl gap-0 overflow-hidden py-0">
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange?.(value as McpClientId)}
        className="gap-0"
      >
        <div
          ref={scroller}
          className="relative flex items-center gap-2 overflow-x-auto border-b px-4 py-3 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-24px),transparent)] [scrollbar-width:none] md:[mask-image:none]"
        >
          <TabsList aria-label="AI app" className="h-auto shrink-0">
            {MCP_CLIENT_IDS.map((id) => (
              <TabsTrigger
                key={id}
                value={id}
                data-client={id}
                className="h-8 gap-1.5 px-2.5"
              >
                <ClientLogo client={id} className="size-5" />
                {MCP_CLIENT_NAMES[id]}
              </TabsTrigger>
            ))}
          </TabsList>
          {more ?? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
            >
              <Element3 aria-hidden className="size-4" />
              More
            </Button>
          )}
        </div>
        {MCP_CLIENT_IDS.map((id) => (
          <TabsContent
            key={id}
            value={id}
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <ConnectPanel
              client={id}
              url={url}
              localUrl={localUrl}
              setup={all[id]}
            />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

/** Logo for a picker client: its mark, or a neutral code glyph. */
function MoreLogo({
  client,
  className,
}: {
  client: McpMoreClient;
  className?: string;
}) {
  const img = "size-full object-contain";
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 grid-cols-1 grid-rows-1 place-items-center",
        className,
      )}
    >
      {!client.logo ? (
        <Code1 aria-hidden className="size-full text-muted-foreground" />
      ) : client.logoDark ? (
        <>
          <img src={client.logo} alt="" className={cn(img, "dark:hidden")} />
          <img
            src={client.logoDark}
            alt=""
            className={cn(img, "hidden dark:block")}
          />
        </>
      ) : (
        <img src={client.logo} alt="" className={img} />
      )}
    </span>
  );
}

/** "More" button plus the picker dialog with every other client's setup. */
function MoreClients({
  url,
  localUrl,
  open,
  selected,
  lastUsed,
  onOpenChange,
  onSelect,
}: {
  url: string;
  localUrl?: string | null;
  open: boolean;
  selected: McpMoreClientId | null;
  lastUsed: McpMoreClientId | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: McpMoreClientId | null) => void;
}) {
  const clients = mcpMoreClients(url);
  const [query, setQuery] = useState("");
  const last = clients.find((client) => client.id === lastUsed);
  const detail = clients.find((client) => client.id === selected);
  const q = query.trim().toLowerCase();
  const shown = q
    ? clients.filter((client) =>
        `${client.name} ${client.hint}`.toLowerCase().includes(q),
      )
    : clients;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="shrink-0">
          {last ? (
            <MoreLogo client={last} className="size-4" />
          ) : (
            <Element3 aria-hidden className="size-4" />
          )}
          More clients
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl max-sm:top-auto max-sm:bottom-0 max-sm:h-[calc(100dvh-0.75rem)] max-sm:max-h-none max-sm:max-w-full max-sm:translate-y-0">
        {detail ? (
          <>
            <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-12 text-left">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Back to all clients"
                onClick={() => onSelect(null)}
              >
                <ArrowLeft aria-hidden className="size-4" />
              </Button>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <MoreLogo client={detail} />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle className="truncate">
                  Connect {detail.name}
                </DialogTitle>
                <DialogDescription className="truncate">
                  {detail.hint}
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              {detail.install && (
                <div>
                  <Button asChild>
                    <a
                      href={detail.install.href}
                      onClick={() =>
                        track("mcp_connect_clicked", { client: detail.id })
                      }
                    >
                      {detail.install.label}
                      <ArrowRight aria-hidden className="size-4" />
                    </a>
                  </Button>
                </div>
              )}
              {detail.snippet && (
                <CodeBlock
                  file={detail.snippet.file}
                  code={detail.snippet.code}
                  wrap={detail.snippet.language === "shell"}
                />
              )}
              <ol className="flex flex-col gap-3">
                {detail.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-muted/40 font-mono text-xs text-foreground/80">
                      {index + 1}
                    </span>
                    <span className="leading-relaxed text-muted-foreground text-pretty">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
              <ServerUrlField url={url} localUrl={localUrl} />
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="gap-3 border-b px-5 pt-5 pb-4 text-left">
              <DialogTitle>Connect another client</DialogTitle>
              <DialogDescription>
                Any app that speaks MCP can use QRdx. Pick yours for the exact
                setup.
              </DialogDescription>
              <div className="relative">
                <SearchNormal1
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search clients"
                  aria-label="Search clients"
                  className="pl-9"
                />
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No client matches “{query}”. Use{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-4"
                    onClick={() => onSelect("any")}
                  >
                    Any MCP client
                  </button>{" "}
                  with the server URL.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {shown.map((client) => (
                    <li key={client.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelect(client.id)}
                        className="flex h-full w-full min-w-0 items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-foreground/15 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                          <MoreLogo client={client} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {client.name}
                          </span>
                          <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                            {client.hint}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface McpPrompt {
  title: string;
  prompt: string;
  icon: Icon;
}

/** Only things the QRdx MCP tools really do: render codes and build payloads. */
const PROMPTS: McpPrompt[] = [
  {
    title: "Café menu",
    prompt:
      "Make a QR code for https://example.com/menu in black and gold, #c9a227 on #111111, with rounded modules, for our café tables.",
    icon: Coffee,
  },
  {
    title: "Guest Wi-Fi card",
    prompt:
      "Create a Wi-Fi QR code for the network Guest with the WPA password welcome-2026, ready to print on a card for our front desk.",
    icon: Wifi,
  },
  {
    title: "Business card",
    prompt:
      "Make a contact QR code for Ada Lovelace, CTO at Example Inc, +1 555 0100, ada@example.com, in our brand blue #155dfc.",
    icon: Personalcard,
  },
  {
    title: "Event check-in",
    prompt:
      "Create a QR code for https://example.com/checkin/conf-2026 with high error correction, so it still scans from a printed badge.",
    icon: TicketStar,
  },
  {
    title: "Codes from a list",
    prompt:
      "Make a QR code for each of these links and give me a Markdown table with the image for each: https://example.com/a, https://example.com/b, https://example.com/c.",
    icon: TableDocument,
  },
  {
    title: "Print-ready file",
    prompt:
      "Generate a 1024 px QR code for https://example.com with a 4-module margin and give me the vector EPS link for our printer.",
    icon: DocumentDownload,
  },
  {
    title: "Shop location",
    prompt:
      "Make a QR code that opens our shop at 51.5007, -0.1246 in a maps app, with circle-shaped modules.",
    icon: Location,
  },
  {
    title: "Feedback by email",
    prompt:
      "Create a QR code that opens an email to feedback@example.com with the subject Store feedback.",
    icon: Sms,
  },
  {
    title: "Text to join",
    prompt:
      "Make a QR code that opens a text message to +1 555 0199 with the message JOIN, for our loyalty club poster.",
    icon: MessageText,
  },
];

/** Where to add QRdx in the app the prompt is sent to. */
function connectHint(tab: AnyClientId | null, url: string, pageUrl: string) {
  const where =
    tab === "claude"
      ? claudeConnectorUrl(url)
      : tab === "chatgpt"
        ? CHATGPT_CONNECTORS_URL
        : pageUrl;
  return `If QRdx isn't connected, add it at ${where} using ${url} first.`;
}

/** Preset prompts with Try in Claude / ChatGPT for the selected app. */
export function McpPromptGallery(props: { url: string; pageUrl: string }) {
  const [tab] = useMcpTab();
  return <McpPromptGalleryView {...props} tab={tab ?? "claude"} />;
}

export function McpPromptGalleryView({
  url,
  pageUrl,
  tab,
}: {
  url: string;
  pageUrl: string;
  tab: AnyClientId | null;
}) {
  const tryIn =
    tab === "claude"
      ? { name: "Claude", build: claudeChatUrl }
      : tab === "chatgpt"
        ? { name: "ChatGPT", build: chatgptChatUrl }
        : null;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PROMPTS.map((item) => {
        const full = `${item.prompt} ${connectHint(tab, url, pageUrl)}`;
        return (
          <li key={item.title} className="min-w-0">
            <Card className="h-full gap-4 p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                  <item.icon
                    aria-hidden
                    className="size-4 text-foreground/80"
                  />
                </span>
                <h3 className="font-medium text-foreground">{item.title}</h3>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground text-pretty">
                “{item.prompt}”
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {tryIn && (
                  <Button asChild size="sm" variant="secondary">
                    <a
                      href={tryIn.build(full)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Try in {tryIn.name}
                      <ArrowRight aria-hidden className="size-3.5" />
                    </a>
                  </Button>
                )}
                <CopyButton
                  text={full}
                  label={`prompt: ${item.title}`}
                  message="Prompt copied."
                  variant={tryIn ? "ghost" : "secondary"}
                >
                  Copy prompt
                </CopyButton>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
