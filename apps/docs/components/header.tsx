"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import { GithubIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/design-system/lib/utils";
import Logo from "@/assets/logo.svg";
import { GetProCTA } from "@/components/get-pro-cta";
import { SocialLink } from "@/components/social-link";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { QrdxLogoAnimation } from "./qrdx-logo-animation";
import { useGithubStars } from "@/lib/hooks/use-github-stars";
import { formatCompactNumber } from "@/utils/format";

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
];

export function Header() {
  const pathname = usePathname();
  const { stargazersCount } = useGithubStars("bucharitesh", "qrdx"); // Update with your GitHub repo

  return (
    <header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/10">
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-5 md:hidden block text-primary" />
            <QrdxLogoAnimation size={30} className="hidden md:block" />
            <span className="hidden font-bold md:block">QRdx</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = pathname === link.url || pathname.startsWith(`${link.url}/`);
              return (
                <Link
                  key={link.url}
                  href={link.url}
                  className={cn(
                    "text-sm font-medium transition-colors text-muted-foreground hover:text-foreground",
                    isActive && "text-foreground"
                  )}
                >
                  {link.text}
                </Link>
              );
            })}
          </nav>
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
