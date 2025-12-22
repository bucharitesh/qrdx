"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { GetProCTA } from "@/components/get-pro-cta";
import { SocialLink } from "@/components/social-link";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { useGithubStars } from "@/lib/hooks/use-github-stars";
import { formatCompactNumber } from "@/utils/format";
import { NavMenu } from "./nav-menu";
import { QrdxLogoAnimation } from "./qrdx-logo-animation";
import { QrdxLogo } from "./qrdx-logo";

const navLinks = [
  {
    text: "Documentation",
    url: "/docs",
  },
  {
    text: "Playground",
    url: "/playground",
  },
  {
    text: "AI",
    url: "/ai",
  },
  {
    text: "Pricing",
    url: "/pricing",
  },
];

export function Header() {
  const { stargazersCount } = useGithubStars("bucharitesh", "qrdx"); // Update with your GitHub repo

  return (
    <header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/10">
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <QrdxLogo season="christmas" className="size-5 md:hidden block fill-secondary-foreground" />
            <QrdxLogoAnimation season="christmas" size={40} className="hidden md:block" />
            <p className="text-sm md:text-lg font-semibold text-secondary-foreground">
              QRdx
            </p>
          </Link>
          <NavMenu />
        </div>
        <div className="flex items-center gap-3.5">
          <GetProCTA className="h-8" />

          <SocialLink
            href="https://github.com/bucharitesh/qrdx"
            className="flex items-center gap-2 text-sm font-bold"
          >
            <Icons.github className="size-4" />
            {stargazersCount > 0 && formatCompactNumber(stargazersCount)}
          </SocialLink>

          <Separator orientation="vertical" className="h-8!" />
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}
