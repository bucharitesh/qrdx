import { cn } from "@repo/design-system/lib/utils";
import { highlight } from "fumadocs-core/highlight";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import type { ComponentProps, ReactNode } from "react";

interface HighlightedCodeProps {
  code: string;
  lang?: string;
  /** File name shown in the code block header. */
  title?: string;
  className?: string;
  viewportClassName?: string;
}

/**
 * Server-highlighted code block that matches the docs' MDX code blocks
 * (same Shiki themes, same fumadocs CodeBlock with its copy button).
 */
export async function HighlightedCode({
  code,
  lang = "tsx",
  title,
  className,
  viewportClassName,
}: HighlightedCodeProps): Promise<ReactNode> {
  return highlight(code.trimEnd(), {
    lang,
    // Same pair as the MDX blocks (source.config.ts).
    themes: { light: "github-light-default", dark: "catppuccin-mocha" },
    // CSS variables only, like the MDX code blocks. Passing `themes` replaces
    // fumadocs' default, whose `defaultColor: false` would otherwise be lost and
    // Shiki would inline the light theme (a light block in dark mode).
    defaultColor: false,
    components: {
      pre: (props: ComponentProps<"pre">) => (
        <CodeBlock
          {...props}
          className={cn(props.className, className)}
          title={title}
          viewportProps={{ className: viewportClassName }}
        >
          <Pre>{props.children}</Pre>
        </CodeBlock>
      ),
    },
  });
}
