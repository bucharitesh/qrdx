"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import { GithubIcon } from "lucide-react";
import Link from "next/link";
import Logo from "@/assets/logo.svg";
import { GetProCTA } from "@/components/get-pro-cta";
import { SocialLink } from "@/components/social-link";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { QrdxLogoAnimation } from "./qrdx-logo-animation";
import { useGithubStars } from "@/lib/hooks/use-github-stars";
import { formatCompactNumber } from "@/utils/format";
export function Header() {
  const { stargazersCount } = useGithubStars("bucharitesh", "qrdx");
  return (
    <header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/10">
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-5 md:hidden block text-primary" />
            <QrdxLogoAnimation size={30} className="hidden md:block" />
            <span className="hidden font-bold md:block">QRdx</span>
          </Link>
        </div>
        <div className="flex items-center gap-3.5">
          <GetProCTA className="h-8" />

          <SocialLink
            href="https://github.com/bucharitesh/qrdx"
            className="flex items-center gap-2 text-sm font-bold"
          >
            <GithubIcon className="size-4" />
            {stargazersCount > 0 && formatCompactNumber(stargazersCount)}
          </SocialLink>

          <Separator orientation="vertical" className="h-8!" />
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}
