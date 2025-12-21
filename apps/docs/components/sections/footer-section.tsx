"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { ChevronRightIcon, GithubIcon } from "lucide-react";
import Link from "next/link";
import Logo from "@/assets/logo.svg";
import { siteConfig } from "@/config/site";

export function FooterSection() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="w-full pb-0">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between p-10 gap-8">
        <div className="flex flex-col items-start justify-start gap-y-5 max-w-xs mx-0">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-6 text-secondary-foreground" />
            <p className="text-xl font-semibold text-secondary-foreground">
              {siteConfig.name}
            </p>
          </Link>
          <p className="tracking-tight text-muted-foreground font-medium text-sm">
            {siteConfig.description}
          </p>
          <div>
            <Button variant="outline" size={"sm"}>
              <GithubIcon className="size-3" />
            </Button>
          </div>
        </div>
        <div className="pt-5 md:w-1/2">
          <div className="flex flex-col items-start justify-start md:flex-row md:justify-between gap-y-5 lg:pl-10">
            {siteConfig.footerLinks.map((column, columnIndex) => (
              <ul key={columnIndex} className="flex flex-col gap-y-2">
                <li className="mb-2 text-sm font-semibold text-secondary-foreground">
                  {column.title}
                </li>
                {column.links.map((link) => (
                  <li
                    key={link.id}
                    className="group inline-flex cursor-pointer items-center justify-start gap-1 text-[15px]/snug text-muted-foreground"
                  >
                    <Link href={link.url}>{link.title}</Link>
                    <div className="flex size-4 items-center justify-center border border-border rounded translate-x-0 transform opacity-0 transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:opacity-100">
                      <ChevronRightIcon className="h-4 w-4 " />
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
      <div className="px-10 pb-8 pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground text-center md:text-left">
          © {currentYear} {siteConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
