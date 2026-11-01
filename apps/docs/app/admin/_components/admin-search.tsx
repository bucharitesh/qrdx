"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { SearchNormal1 } from "iconsax-reactjs";
import { usePathname, useSearchParams } from "next/navigation";

/** The search box at the top of every admin page (a plain GET form). */
export function AdminSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/admin/search" ? (params.get("q") ?? "") : "";

  return (
    <search>
      <form action="/admin/search" className="relative" method="get">
        <SearchNormal1
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          aria-label="Search users, codes, pages, teams and apps"
          autoComplete="off"
          className="pl-9"
          defaultValue={current}
          key={current}
          maxLength={200}
          name="q"
          placeholder="Search email, name, user id, short link, destination, team or client id"
          type="search"
        />
      </form>
    </search>
  );
}
