"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import { GetProCTA } from "@/components/get-pro-cta";
import { SocialLink } from "@/components/social-link";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { Icons } from "./icons";

export function HomeNav() {
  return (
    <div className="flex items-center gap-3.5">
      <GetProCTA className="h-8" />

      <SocialLink
        href="https://github.com/bucharitesh/qrdx"
        className="flex items-center gap-2 text-sm font-bold"
      >
        <Icons.github className="size-4" />
      </SocialLink>

      <Separator orientation="vertical" className="h-8" />
      <UserProfileDropdown />
    </div>
  );
}
