"use client";

import { Apple, Globe, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass, linkProps } from "@/components/landing/block-kit";
import {
  type AppLink,
  type AppPlatform,
  detectAppPlatform,
  orderAppLinks,
} from "./apps-platform";

const ICONS = { ios: Apple, android: Play, web: Globe } as const;

/**
 * Store buttons with the visitor's store first. `platform` comes from the
 * server (user agent) when the renderer knows it; otherwise it's detected
 * here after hydration (iPads that report a Mac user agent included).
 */
export function AppsLinks({
  blockId,
  links,
  platform,
}: {
  blockId: string;
  links: AppLink[];
  platform?: AppPlatform;
}) {
  const [detected, setDetected] = useState<AppPlatform>(platform ?? "other");

  useEffect(() => {
    if (platform) return;
    const iPadDesktopMode =
      /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    setDetected(
      iPadDesktopMode ? "ios" : detectAppPlatform(navigator.userAgent),
    );
  }, [platform]);

  const [primary, ...others] = orderAppLinks(links, detected);
  if (!primary) return null;
  const PrimaryIcon = ICONS[primary.kind];

  return (
    <div className="space-y-2">
      <a
        className={buttonClass("filled")}
        {...linkProps(primary.href, blockId, primary.kind)}
      >
        <PrimaryIcon aria-hidden="true" className="size-4" />
        {primary.label}
      </a>
      {others.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {others.map((link) => {
            const Icon = ICONS[link.kind];
            return (
              <a
                className={buttonClass("outline")}
                key={link.kind}
                {...linkProps(link.href, blockId, link.kind)}
              >
                <Icon aria-hidden="true" className="size-4" />
                {link.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
