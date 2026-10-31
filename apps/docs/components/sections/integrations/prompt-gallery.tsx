"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { ExportSquare } from "iconsax-reactjs";
import { CopyButton } from "./code-snippet";

export interface PromptCard {
  title: string;
  prompt: string;
  /** Prefilled chat URL (prompt plus a "connect first" line). */
  href: string;
}

/** Ready prompts with "Try in …" (opens a prefilled chat) and copy. */
export function PromptGallery({
  prompts,
  clientName,
}: {
  prompts: PromptCard[];
  clientName: string;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {prompts.map((item) => (
        <li key={item.title}>
          <Card className="h-full gap-3 p-5 shadow-xs dark:shadow-none">
            <h3 className="font-medium leading-snug">{item.title}</h3>
            <p className="line-clamp-4 flex-1 text-sm leading-relaxed text-muted-foreground">
              “{item.prompt}”
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" asChild>
                <a href={item.href} target="_blank" rel="noopener noreferrer">
                  Try in {clientName}
                  <ExportSquare aria-hidden className="size-3.5" />
                </a>
              </Button>
              <CopyButton
                text={item.prompt}
                label={`prompt “${item.title}”`}
                className="h-8"
              />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
