"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Mobile } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

// Installing the scanner (its manifest: lib/scanner-app.ts). Browsers that
// offer an install prompt (Chrome, Edge, Samsung Internet) get one quiet
// button; Safari, which has no prompt, gets the steps on request. Nothing
// shows inside the installed app.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The prompt can fire before React hydrates, so it's caught when this
// module loads and kept until the button uses it.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Our button replaces the browser's own install banner.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Browsers with no install prompt where Add to Home Screen (or Dock) works. */
export type ManualInstall = "ios" | "mac" | null;

export function manualInstall(
  userAgent: string,
  maxTouchPoints: number,
): ManualInstall {
  // iPadOS reports itself as a Mac; touch gives it away.
  if (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  ) {
    return "ios";
  }
  const safari = /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//.exec(
    userAgent,
  );
  if (
    safari &&
    /Macintosh/.test(userAgent) &&
    !/Chrome|Chromium|Edg|Firefox|OPR/.test(userAgent) &&
    Number(safari[1]) >= 17
  ) {
    return "mac";
  }
  return null;
}

function isInstalledApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallScanner() {
  const t = useTranslations("scanner.install");
  const prompt = useSyncExternalStore(
    subscribe,
    () => deferred,
    () => null,
  );
  const [manual, setManual] = useState<ManualInstall>(null);
  const [inApp, setInApp] = useState(true);

  useEffect(() => {
    setInApp(isInstalledApp());
    setManual(manualInstall(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  if (inApp) return null;

  if (prompt) {
    const install = async () => {
      await prompt.prompt();
      await prompt.userChoice;
      // A prompt can be shown only once; a dismissed one comes back on a
      // later visit, an accepted one never does.
      if (deferred === prompt) deferred = null;
      notify();
    };
    return (
      <Button onClick={install} size="sm" type="button" variant="outline">
        <Mobile className="size-3.5" />
        {t("install")}
      </Button>
    );
  }

  if (!manual) return null;

  const steps =
    manual === "ios"
      ? [t("iosShare"), t("iosAdd"), t("iosConfirm")]
      : [t("macAdd"), t("macConfirm")];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Mobile className="size-3.5" />
          {manual === "ios" ? t("iosButton") : t("macButton")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] text-sm"
        collisionPadding={16}
      >
        <p className="font-medium">
          {manual === "ios" ? t("iosTitle") : t("macTitle")}
        </p>
        <ol className="mt-3 flex flex-col gap-2.5">
          {steps.map((step, index) => (
            <li className="flex items-start gap-3" key={step}>
              <span className="grid size-6 shrink-0 place-items-center rounded-md border bg-muted/40 font-mono text-xs text-foreground/80">
                {index + 1}
              </span>
              <span className="text-muted-foreground leading-snug text-pretty">
                {step}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          {t("after")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
