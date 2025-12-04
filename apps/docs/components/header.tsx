"use client";

import { QrCodeIcon, GithubIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { SocialLink } from "@/components/social-link";
import { GetProCTA } from "@/components/get-pro-cta";
import { useGithubStars } from "@/lib/hooks/use-github-stars";
import { formatCompactNumber } from "@/utils/format";

export function Header() {
  const { stargazersCount } = useGithubStars("your-username", "qrdx"); // Update with your GitHub repo

  return (
    <header className="border-b">
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-1">
          <Link href="/" className="flex items-center gap-2">
            <QrCodeIcon className="size-6" />
            <span className="hidden font-bold md:block">qrdx</span>
          </Link>
        </div>
        <div className="flex items-center gap-3.5">
          <GetProCTA className="h-8" />

          <SocialLink
            href="https://github.com/your-username/qrdx"
            className="flex items-center gap-2 text-sm font-bold"
          >
            <GithubIcon className="size-4" />
            {stargazersCount > 0 && formatCompactNumber(stargazersCount)}
          </SocialLink>
          
          <Separator orientation="vertical" className="h-8" />
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}
