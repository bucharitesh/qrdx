import { cn } from "@repo/design-system/lib/utils";
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

/** HTML/CSS mock of an MCP session: install, prompt, tool call and result. */
export function McpTerminal({ mcpUrl, className }: McpTerminalProps) {
  const options = qrOptionsSchema.parse(args);
  const svgUrl = buildQrImageUrl(options);
  const pngUrl = buildQrImageUrl(options, "png");
  const { pathname, search } = new URL(svgUrl);

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-300 shadow-2xl shadow-black/40",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-9 items-center gap-1.5 border-b border-white/10 bg-neutral-900 px-4"
      >
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto pr-10 text-xs text-neutral-500">Terminal</span>
      </div>
      <div className="flex flex-col gap-4 p-4 font-mono text-[11px] leading-relaxed sm:p-5 sm:text-xs">
        <p className="break-all">
          <span className="text-neutral-500 select-none">$ </span>
          <span className="text-neutral-100">
            claude mcp add --transport http qrdx {mcpUrl}
          </span>
        </p>
        <p className="text-neutral-100">
          <span className="text-[#5b8dff] select-none">&gt; </span>
          {PROMPT}
        </p>
        <div className="flex flex-col gap-1.5">
          <p>
            <span className="text-emerald-400 select-none">● </span>
            <span className="text-neutral-100">qrdx · generate_qr_code</span>
            <span className="text-neutral-500">
              {" "}
              (data: "{args.data}", fg: "{args.fg}", body: "{args.body}")
            </span>
          </p>
          <div className="flex flex-col gap-3 border-l border-white/10 pl-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 break-all text-neutral-400">
              <p>
                QR code, {options.size}x{options.size}px, error correction{" "}
                {options.level}.
              </p>
              <p>SVG URL: {svgUrl}</p>
              <p>PNG URL: {pngUrl}</p>
              <p>Markdown: ![QR code]({svgUrl})</p>
            </div>
            <img
              src={`${pathname}${search}`}
              alt="QR code for https://example.com with blue rounded modules"
              width={112}
              height={112}
              loading="lazy"
              decoding="async"
              className="size-24 shrink-0 rounded-md bg-white sm:size-28"
            />
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Example session: adding the QRdx MCP server to Claude Code, asking for a
        QR code and the generate_qr_code result.
      </figcaption>
    </figure>
  );
}
