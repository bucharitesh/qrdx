"use client";

import { QrCodeIcon } from "lucide-react";
import Link from "next/link";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";

export function Header() {
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
          {/* <SocialLink
            href="https://github.com/jnsahaj/tweakcn"
            className="flex items-center gap-2 text-sm font-bold"
          >
            <GitHubIcon className="size-4" />
            {stargazersCount > 0 && formatCompactNumber(stargazersCount)}
          </SocialLink> */}
          {/* <Separator orientation="vertical" className="h-8" /> */}
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}
