import { cn } from "@repo/design-system/lib/utils";
import {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
} from "fumadocs-ui/components/codeblock";
import { HighlightedCode } from "./highlighted-code";

const MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;
type Manager = (typeof MANAGERS)[number];

/** Turns an `npx …` or `npm install …` command into each package manager's. */
function toCommands(command: string): Record<Manager, string> {
  if (command.startsWith("npx ")) {
    const rest = command.slice("npx ".length);
    return {
      pnpm: `pnpm dlx ${rest}`,
      npm: command,
      yarn: `yarn dlx ${rest}`,
      bun: `bunx --bun ${rest}`,
    };
  }
  if (command.startsWith("npm install ")) {
    const rest = command.slice("npm install ".length);
    return {
      pnpm: `pnpm add ${rest}`,
      npm: command,
      yarn: `yarn add ${rest}`,
      bun: `bun add ${rest}`,
    };
  }
  return { pnpm: command, npm: command, yarn: command, bun: command };
}

interface PackageManagerTabsProps {
  /** The npm form of the command: `npx …` or `npm install …`. */
  command: string;
  className?: string;
}

/**
 * pnpm / npm / yarn / bun switcher. Shares and remembers the choice with the
 * docs' other package manager tabs.
 */
export function PackageManagerTabs({
  command,
  className,
}: PackageManagerTabsProps) {
  const commands = toCommands(command);

  return (
    <CodeBlockTabs
      className={cn("not-prose", className)}
      defaultValue="pnpm"
      groupId="package-manager"
      persist
    >
      <CodeBlockTabsList>
        {MANAGERS.map((manager) => (
          <CodeBlockTabsTrigger key={manager} value={manager}>
            {manager}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {MANAGERS.map((manager) => (
        <CodeBlockTab key={manager} value={manager}>
          <HighlightedCode code={commands[manager]} lang="bash" />
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}
