"use client";

import { Close } from "@repo/design-system/components/icons";
import { ArrowLeft, ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { useState } from "react";
import { TEMPLATES_PATH } from "@/lib/landing/demo-paths";
import { UseTemplateLink } from "./use-template-link";

/** Slim, dismissible strip above a template demo: what it is and how to start. */
export function DemoBar({
  templateName,
  type,
  variantId,
}: {
  templateName: string;
  type: string;
  variantId: string;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <aside
      aria-label="Template demo"
      className="relative z-20 border-b bg-background text-foreground"
    >
      <div className="flex h-10 items-center justify-center gap-2 px-11 text-[13px] sm:px-40 sm:text-sm">
        <Link
          className="text-muted-foreground absolute left-3 hidden items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:inline-flex"
          href={TEMPLATES_PATH}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          All templates
        </Link>
        <span className="text-muted-foreground min-w-0 truncate">
          <span className="hidden sm:inline">This is a demo of the </span>
          <span className="sm:hidden">Demo of the </span>
          <span className="text-foreground font-medium">{templateName}</span>{" "}
          template
        </span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <UseTemplateLink
          className="group inline-flex shrink-0 items-center gap-1 rounded-sm font-medium underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-busy:opacity-60"
          type={type}
          variantId={variantId}
        >
          <span className="sm:hidden">Use it</span>
          <span className="hidden sm:inline">Use this template</span>
          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </UseTemplateLink>
        <button
          aria-label="Hide this bar"
          className="text-muted-foreground absolute right-2 grid size-7 place-items-center rounded-full transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => setOpen(false)}
          type="button"
        >
          <Close aria-hidden className="size-4" />
        </button>
      </div>
    </aside>
  );
}
