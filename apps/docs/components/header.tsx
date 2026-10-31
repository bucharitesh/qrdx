"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import Link from "next/link";
import { GetProCTA } from "@/components/get-pro-cta";
import { Icons } from "@/components/icons";
import { SocialLink } from "@/components/social-link";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { useGithubStars } from "@/lib/hooks/use-github-stars";
import { formatCompactNumber } from "@/utils/format";
import { HeaderMobileMenu } from "./header-mobile-nav";
import { HeaderNav } from "./header-nav";
import { QrdxLogo } from "./qrdx-logo";
import { QrdxLogoAnimation } from "./qrdx-logo-animation";

export function Header() {
  const { stargazersCount } = useGithubStars("bucharitesh", "qrdx"); // Update with your GitHub repo

  return (
    // z-40: backdrop-blur makes the header its own stacking context, so the
    // nav dropdowns would otherwise sit under positioned page content.
    <header className="relative z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/10">
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2 lg:gap-4">
          <HeaderMobileMenu />
          <Link href="/" className="flex items-center gap-2">
            <QrdxLogo className="size-5 md:hidden block fill-secondary-foreground" />
            <QrdxLogoAnimation size={40} className="hidden md:block" />
            <p className="text-sm md:text-lg font-semibold text-secondary-foreground">
              QRdx
            </p>
          </Link>
          <HeaderNav />
        </div>
        <div className="flex items-center gap-3.5">
          <GetProCTA className="h-8" />

          <SocialLink
            href="https://github.com/bucharitesh/qrdx"
            className="hidden items-center gap-2 text-sm font-bold sm:flex"
          >
            <Icons.github className="size-4" />
            {stargazersCount > 0 && formatCompactNumber(stargazersCount)}
          </SocialLink>

          <Separator orientation="vertical" className="hidden h-8! sm:block" />
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}
