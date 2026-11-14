"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTheme } from "next-themes";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  code: string;
  language: string;
  className?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({
  code,
  language,
  className,
  showLineNumbers = false,
}: CodeBlockProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div
      className={cn(
        "bg-background text-foreground relative w-full overflow-hidden rounded-md border",
        className,
      )}
    >
      <SyntaxHighlighter
        className="overflow-hidden"
        codeTagProps={{
          className: "font-mono text-sm",
        }}
        customStyle={{
          margin: 0,
          padding: "1rem",
          fontSize: "0.875rem",
          background: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
        }}
        language={language}
        lineNumberStyle={{
          color: "hsl(var(--muted-foreground))",
          paddingRight: "1rem",
          minWidth: "2.5rem",
        }}
        showLineNumbers={showLineNumbers}
        style={resolvedTheme === "light" ? oneLight : oneDark}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
