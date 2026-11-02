"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { MessageQuestion } from "iconsax-reactjs";
import Link from "next/link";
import { HELP_LINKS } from "./help-links";

export function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Help"
          className="size-8"
          size="icon"
          variant="ghost"
        >
          <MessageQuestion aria-hidden className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {HELP_LINKS.map(({ id, href, label, icon: LinkIcon }) => (
          <DropdownMenuItem asChild key={id}>
            <Link href={href}>
              <LinkIcon aria-hidden />
              {label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
