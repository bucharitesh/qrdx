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
import { useTranslations } from "next-intl";
import { unreadLabel } from "@/lib/changelog-feed";
import { HELP_LINKS } from "./help-links";
import { useWhatsNew } from "./whats-new";

/**
 * Docs, help and support. "What's new" opens the app's panel (with the
 * unread count) instead of leaving for /changelogs. On phones, where the
 * sidebar's "What's new" row sits in the menu sheet, the button carries a
 * dot while something is unread.
 */
export function HelpMenu() {
  const t = useTranslations("app.shell.helpMenu");
  const whatsNew = useWhatsNew();
  const unread = whatsNew?.unread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={
            unread > 0
              ? t("helpValueNewUpdates", { value: unreadLabel(unread) })
              : t("help")
          }
          className="relative size-8"
          size="icon"
          variant="ghost"
        >
          <MessageQuestion aria-hidden className="size-5" />
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-primary ring-background absolute top-1 right-1 size-1.5 rounded-full ring-2 md:hidden"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {HELP_LINKS.map(({ id, href, label, icon: LinkIcon }) =>
          id === "changelog" && whatsNew ? (
            <DropdownMenuItem key={id} onSelect={whatsNew.openPanel}>
              <LinkIcon aria-hidden />
              <span className="flex-1">{label}</span>
              {unread > 0 && (
                <span className="text-primary text-xs font-medium tabular-nums">
                  {unreadLabel(unread)}
                </span>
              )}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild key={id}>
              <Link href={href}>
                <LinkIcon aria-hidden />
                {label}
              </Link>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
