"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Icons } from "@/components/icons";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { QrdxLogo } from "../qrdx-logo";
import { ChevronDown } from "lucide-react";

export function FooterSection() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="w-full pb-0">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between p-10 gap-8">
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
            <Button variant="outline" size={"sm"}>
              <Icons.github className="size-3" />
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
                {column.links?.map((link) => {
                  const hasChildren = "children" in link && link.children && link.children.length > 0;
                  
                  if (hasChildren) {
                    return (
                      <li
                        key={link.id}
                        className="inline-flex cursor-pointer items-center justify-start gap-1 text-[15px]/snug text-muted-foreground hover:text-secondary-foreground transition-all duration-300"
                      >
                        <Popover>
                          <PopoverTrigger className="inline-flex items-center gap-1">
                            {link.title}
                            <ChevronDown className="size-3" />
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-56 p-2"
                            align="start"
                            side="top"
                          >
                            <div className="flex flex-col gap-1">
                              {link.children?.map((child) => (
                                <Link
                                  key={child.id}
                                  href={child.url as string}
                                  className="px-3 py-2 text-sm text-muted-foreground hover:text-secondary-foreground hover:bg-accent rounded-md transition-all"
                                >
                                  {child.title}
                                </Link>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </li>
                    );
                  }
                  
                  return (
                    <li
                      key={link.id}
                      className="inline-flex cursor-pointer items-center justify-start gap-1 text-[15px]/snug text-muted-foreground hover:text-secondary-foreground transition-all duration-300"
                    >
                      <Link href={link.url as string}>{link.title}</Link>
                    </li>
                  );
                })}
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
