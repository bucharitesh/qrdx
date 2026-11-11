"use client";

import {
  type AllConsentNames,
  ConsentDraftProvider,
  useConsentDraft,
  usePromptRequirement,
} from "@c15t/nextjs";
import { useHeadlessConsentUI } from "@c15t/nextjs/headless";
import { Tick } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Chart2, type Icon, Lock1, MessageQuestion } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";
import { PRIVACY_POLICY_URL, TEXT_LINK } from "./consent-copy";
import { OPEN_COOKIE_SETTINGS_EVENT } from "./open-cookie-settings";

/** Title and description: messages (consent.categories). Tool names stay as is. */
type CategoryCopy = {
  key: "necessary" | "functionality" | "measurement";
  tools: string;
  icon: Icon;
};

const CATEGORY_COPY: Partial<Record<AllConsentNames, CategoryCopy>> = {
  necessary: {
    key: "necessary",
    tools: "QRdx, Cloudflare Turnstile",
    icon: Lock1,
  },
  functionality: {
    key: "functionality",
    tools: "Featurebase",
    icon: MessageQuestion,
  },
  measurement: {
    key: "measurement",
    tools: "PostHog",
    icon: Chart2,
  },
};

/** Preference center: opened from the banner or any Cookie settings trigger. */
export function CookiePreferences() {
  const t = useTranslations("consent.dialog");
  const { dialog, openDialog, openBanner, closeUI } = useHeadlessConsentUI();
  const prompt = usePromptRequirement();
  // No DialogTrigger here, so remember who opened the dialog (banner button,
  // footer link) and hand focus back on close. Layout effect: runs before the
  // dialog's own focus move.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openDialog);
    return () =>
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openDialog);
  }, [openDialog]);

  useLayoutEffect(() => {
    if (!dialog.isVisible) return;
    const active = document.activeElement;
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }, [dialog.isVisible]);

  const onCloseAutoFocus = (event: Event) => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  };

  // Closing without a choice brings the banner back while one is still owed.
  const onOpenChange = (open: boolean) => {
    if (open) return;
    if (prompt.kind === "choice") openBanner();
    else closeUI();
  };

  return (
    <Dialog open={dialog.isVisible} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-5 motion-reduce:animate-none sm:max-w-md"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so every open starts from the saved choice. */}
        <ConsentDraftProvider>
          <PreferencesForm />
        </ConsentDraftProvider>
      </DialogContent>
    </Dialog>
  );
}

function PreferencesForm() {
  const t = useTranslations("consent");
  const draft = useConsentDraft();
  const { dialog, performDialogAction } = useHeadlessConsentUI();
  const actions = dialog.orderedActions.filter(
    (action) => action === "accept" || action === "reject" || action === "save",
  );

  return (
    <>
      <ul className="divide-y rounded-lg border">
        {draft.displayedCategories.map((category) => {
          const copy = CATEGORY_COPY[category];
          if (!copy) return null;
          return (
            <CategoryRow
              key={category}
              category={category}
              copy={copy}
              checked={category === "necessary" || draft.values[category]}
              onCheckedChange={(value) => draft.set(category, value)}
            />
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {t.rich("dialog.details", {
          link: (chunks) => (
            <Link href={PRIVACY_POLICY_URL} className={TEXT_LINK}>
              {chunks}
            </Link>
          ),
        })}
      </p>
      <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            variant={action === "save" ? "default" : "outline"}
            className={
              action === "save" ? "col-span-2 sm:col-span-1" : undefined
            }
            onClick={() => void performDialogAction(action)}
          >
            {action === "save" && <Tick aria-hidden="true" />}
            {t(`actions.${action}`)}
          </Button>
        ))}
      </DialogFooter>
    </>
  );
}

function CategoryRow({
  category,
  copy,
  checked,
  onCheckedChange,
}: {
  category: AllConsentNames;
  copy: CategoryCopy;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  const t = useTranslations("consent");
  const switchId = `cookie-category-${category}`;
  const descriptionId = `${switchId}-description`;
  const required = category === "necessary";
  const Icon = copy.icon;

  return (
    <li className="flex items-start gap-3 p-4">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40"
      >
        <Icon className="size-4 text-foreground/80" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-h-9 items-center justify-between gap-3">
          {required ? (
            <span className="text-sm font-medium">
              {t(`categories.${copy.key}.title`)}
            </span>
          ) : (
            <label htmlFor={switchId} className="text-sm font-medium">
              {t(`categories.${copy.key}.title`)}
            </label>
          )}
          {required ? (
            <Badge variant="outline" className="text-muted-foreground">
              <Tick aria-hidden="true" />
              {t("dialog.alwaysOn")}
            </Badge>
          ) : (
            <Switch
              id={switchId}
              checked={checked}
              onCheckedChange={onCheckedChange}
              aria-describedby={descriptionId}
            />
          )}
        </div>
        <p
          id={descriptionId}
          className="text-pretty text-sm text-muted-foreground"
        >
          {t(`categories.${copy.key}.description`)}
        </p>
        <p className="text-xs text-muted-foreground/80">
          {t("dialog.usedBy", { tools: copy.tools })}
        </p>
      </div>
    </li>
  );
}
