"use client";

import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { QrdxLogo } from "../qrdx-logo";

export function FooterSection() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="w-full pb-0">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between p-10 gap-8">
        <div className="flex flex-col items-start justify-start gap-y-5 max-w-xs mx-0">
          <Link href="/" className="flex items-center gap-2">
            <QrdxLogo className="size-6 text-secondary-foreground" />
            <p className="text-xl font-semibold text-secondary-foreground">
              {siteConfig.name}
            </p>
          </Link>
          <p className="tracking-tight text-muted-foreground font-medium text-sm">
            {siteConfig.description}
          </p>
          <div>
            <Button variant="outline" size={"sm"} asChild>
              <Link href={siteConfig.links.github} aria-label="QRdx on GitHub">
                <Icons.github className="size-3" />
              </Link>
            </Button>
          </div>
        </div>
        <nav aria-label="Footer" className="pt-5 lg:flex-1">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6 lg:pl-10">
            {siteConfig.footerLinks.map((column) => (
              <ul key={column.title} className="flex flex-col gap-y-2">
                <li className="mb-2 text-sm font-semibold text-secondary-foreground">
                  {column.title}
                </li>
                {column.links.map((link) => (
                  <li
                    key={link.id}
                    className="text-sm/snug text-muted-foreground hover:text-secondary-foreground transition-colors"
                  >
                    <Link href={link.url}>{link.title}</Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </nav>
      </div>
      <div className="px-10 pb-8 pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground text-center md:text-left">
          © {currentYear} {siteConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
