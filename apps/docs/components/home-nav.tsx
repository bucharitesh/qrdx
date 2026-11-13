"use client";

import { GITHUB_REPO_URL } from "@repo/config";
import { GithubLogo } from "@repo/design-system/components/icons";
import { Separator } from "@repo/design-system/components/ui/separator";
import { GetProCTA } from "@/components/get-pro-cta";
import { SocialLink } from "@/components/social-link";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";

export function HomeNav() {
  return (
    <div className="flex items-center gap-3.5">
      <GetProCTA className="h-8" />

      <SocialLink
        href={GITHUB_REPO_URL}
        className="flex items-center gap-2 text-sm font-bold"
      >
        <GithubLogo className="size-4" />
      </SocialLink>

      <Separator orientation="vertical" className="h-8" />
      <UserProfileDropdown />
    </div>
  );
}
