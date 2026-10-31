import { type CatalogAction, withOrigin } from "@repo/integrations/src/catalog";
import {
  cursorInstallUrl,
  mcpServerUrl,
  vscodeInstallUrl,
} from "@/lib/mcp-clients";

/** A catalog action with every URL resolved, safe to pass to the client. */
export type ResolvedAction =
  | { type: "link"; label: string; href: string; external: boolean }
  | { type: "copy"; label: string; text: string; toast: string }
  | {
      type: "copy-open";
      label: string;
      text: string;
      href: string;
      toast: string;
    };

const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

export function resolveAction(
  action: CatalogAction,
  origin: string,
): ResolvedAction {
  switch (action.type) {
    case "link": {
      const href = withOrigin(action.href, origin);
      return {
        type: "link",
        label: action.label,
        href,
        external: isExternal(href),
      };
    }
    case "copy":
      return {
        type: "copy",
        label: action.label,
        text: withOrigin(action.text, origin),
        toast: action.toast ?? "Copied to clipboard",
      };
    case "copy-open":
      return {
        type: "copy-open",
        label: action.label,
        text: withOrigin(action.text, origin),
        href: action.href,
        toast: action.toast,
      };
    case "mcp-install":
      return {
        type: "link",
        label: action.label,
        href: (action.client === "cursor"
          ? cursorInstallUrl
          : vscodeInstallUrl)(mcpServerUrl(origin)),
        external: true,
      };
  }
}
