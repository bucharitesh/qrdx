import { cn } from "@repo/design-system/lib/utils";
import { easterEggUrl } from "@/lib/easter-eggs";
import { buildQrImageUrl, qrOptionsSchema } from "@/lib/qr-render";

const PROMPT =
  "Make a QR code for https://example.com in our brand blue, #155dfc, with rounded modules.";

// The arguments an assistant sends for PROMPT. The result lines below are
// built with the same helpers the MCP server uses, so they match its output.
const args = { data: "https://example.com", fg: "#155dfc", body: "rounded" };

interface McpTerminalProps {
  mcpUrl: string;
  className?: string;
}

/** "qrdx.dev/api/v1/qr?data=…" — host and path, without the scheme. */
const short = (url: string) => {
  const { host, pathname, search } = new URL(url);
  return `${host}${pathname}${search}`;
};

/**
 * HTML/CSS mock of a chat with an AI assistant that has the QRdx MCP server:
 * the prompt, the tool call and the reply with the image and links. Every
 * line truncates or wraps inside the card, so it never overflows.
 */
export function McpTerminal({ mcpUrl, className }: McpTerminalProps) {
  const options = qrOptionsSchema.parse(args);
  const svgUrl = buildQrImageUrl(options);
  // The pictured code is an easter egg (lib/easter-eggs.ts); the links match the prompt.
  const { pathname, search } = new URL(
    buildQrImageUrl({ ...options, data: easterEggUrl("mcp") }),
  );
  const links = [
    { label: "SVG", url: svgUrl },
    { label: "PNG", url: buildQrImageUrl(options, "png") },
    { label: "EPS", url: buildQrImageUrl(options, "eps") },
  ];

  return (
    <figure
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border bg-card text-left shadow-xs dark:shadow-none",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-10 items-center gap-1.5 border-b bg-muted/30 px-4"
      >
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="ml-3 min-w-0 truncate text-xs text-muted-foreground">
          Your AI assistant
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          qrdx connected
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4 text-sm leading-relaxed sm:p-5">
        <p className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-foreground text-pretty">
          {PROMPT}
        </p>

        <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-emerald-500"
          />
          <span className="shrink-0 text-foreground">generate_qr_code</span>
          <span className="min-w-0 truncate text-muted-foreground">
            data: "{args.data}", fg: "{args.fg}", body: "{args.body}"
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-foreground/90 text-pretty">
            Here's your QR code: {options.size}×{options.size} px, error
            correction {options.level}, with links you can paste into Markdown
            or HTML.
          </p>
          <div className="flex min-w-0 items-center gap-3 rounded-xl border p-2.5 sm:gap-4 sm:p-3">
            <img
              src={`${pathname}${search}`}
              alt="QR code with blue rounded modules"
              width={112}
              height={112}
              loading="lazy"
              decoding="async"
              className="size-20 shrink-0 rounded-lg bg-white p-1 ring-1 ring-black/5 sm:size-24"
            />
            <dl className="grid min-w-0 flex-1 gap-1.5 font-mono text-xs">
              {links.map((link) => (
                <div key={link.label} className="flex min-w-0 gap-2">
                  <dt className="w-8 shrink-0 text-muted-foreground">
                    {link.label}
                  </dt>
                  <dd className="min-w-0 truncate text-foreground/80">
                    {short(link.url)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Example chat: with the QRdx MCP server at {mcpUrl}, the assistant calls
        generate_qr_code and replies with the QR code image and SVG, PNG and EPS
        links.
      </figcaption>
    </figure>
  );
}
