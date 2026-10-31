"use client";

import { toast } from "@repo/design-system";
import { GithubLogo } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight, Copy, ExportSquare } from "iconsax-reactjs";
import Link from "next/link";
import { soundEvent } from "@/lib/sound/emit";
import type { ResolvedAction } from "./resolve-action";

interface IntegrationActionProps {
  action: ResolvedAction;
  variant?: "default" | "outline";
  className?: string;
}

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
    soundEvent("copy");
  } catch {
    toast.error("Couldn't copy. Select the text and copy it instead.");
  }
}

/** Renders a catalog action as a pill button: link, copy, or copy + open. */
export function IntegrationAction({
  action,
  variant = "default",
  className,
}: IntegrationActionProps) {
  if (action.type === "copy") {
    return (
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => copy(action.text, action.toast)}
      >
        <Copy aria-hidden className="size-4" />
        {action.label}
      </Button>
    );
  }

  if (action.type === "copy-open") {
    // A real link (new tab) whose click also copies, so pop-up blockers and
    // middle clicks behave like any other link.
    return (
      <Button variant={variant} className={className} asChild>
        <a
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void copy(action.text, action.toast);
          }}
        >
          {action.label}
          <ExportSquare aria-hidden className="size-4" />
        </a>
      </Button>
    );
  }

  if (!action.external) {
    return (
      <Button variant={variant} className={className} asChild>
        <Link href={action.href}>
          {action.label}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Button>
    );
  }

  const web = /^https?:/i.test(action.href);
  const github = action.href.startsWith("https://github.com/");

  return (
    <Button variant={variant} className={className} asChild>
      <a
        href={action.href}
        {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {github && <GithubLogo aria-hidden className="size-4" />}
        {action.label}
        {web && !github && <ExportSquare aria-hidden className="size-4" />}
      </a>
    </Button>
  );
}
