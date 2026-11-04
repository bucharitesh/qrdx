"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Brush } from "iconsax-reactjs";
import Link from "next/link";
import { ScanChecker } from "@/components/sections/tools/scan-checker";
import { parseLinkUrl, playgroundHref } from "@/lib/playground-links";

/**
 * The page's checker: an http(s) result can be restyled in the playground.
 * playgroundHref puts the address after `#`, so it never reaches a server;
 * an address a link can't carry (credentials, too long) gets no button.
 */
export function PageScanChecker() {
  return (
    <ScanChecker
      renderLinkAction={(link) => {
        const url = parseLinkUrl(link);
        if (!url) return null;
        return (
          <Button asChild size="sm" variant="outline">
            <Link href={playgroundHref({ url })}>
              <Brush className="size-3.5" />
              Restyle this link in the playground
            </Link>
          </Button>
        );
      }}
    />
  );
}
