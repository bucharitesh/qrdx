"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Icons } from "@/components/icons";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-clipboard";

export function CopySnippetButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const { copyToClipboard, hasCopied } = useCopyToClipboard();

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={() => copyToClipboard(text)}
      aria-label={`Copy ${label}`}
    >
      {hasCopied ? (
        <Icons.CopyCheck className="size-3.5" />
      ) : (
        <Icons.Copy className="size-3.5" />
      )}
      {hasCopied ? "Copied" : "Copy"}
    </Button>
  );
}
