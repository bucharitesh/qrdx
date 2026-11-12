"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@repo/design-system/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import { cn } from "@repo/design-system/lib/utils";
import {
  Element3,
  Flash,
  type Icon,
  Keyboard,
  More,
  People,
  ScanBarcode,
  TableDocument,
} from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { PLUGINS } from "@/app/[lang]/(home)/plugins/plugin-data";
import {
  currentBuilderRequest,
  openPlaygroundBuilder,
} from "@/components/code-builder/in-place";
import {
  dynamicBlockedReason,
  openCodeBuilderIntent,
} from "@/components/code-builder/playground-request";
import { useCommunitySheetStore } from "@/components/editor/community-sheet-store";
import { useDynamicLinkStore } from "@/components/editor/dynamic-link-toggle";
import { usePhotoScanDialogStore } from "@/components/editor/photo-scan-dialog-store";
import { useKeyboardShortcutsModal } from "@/components/keyboard-shortcuts-trigger";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";

/** The bulk tool with "My editor style" preselected (it reads the persisted editor store). */
export const BULK_FROM_EDITOR_HREF = "/tools/bulk?style=editor";

const listedPlugins = PLUGINS.filter((plugin) => plugin.storeUrl).length;
/** Honest about where the plugins install from until each store listing is live. */
const PLUGINS_HINT =
  listedPlugins === 0
    ? "noneListed"
    : listedPlugins < PLUGINS.length
      ? "someListed"
      : undefined;

interface MoreItem {
  id: string;
  label: string;
  hint?: string;
  icon: Icon;
  /** A page to go to; otherwise `run` opens something over the editor. */
  href?: string;
  run?: () => void;
  kbd?: string;
  /** Starts a new group below a line. */
  separated?: boolean;
  /** Shown but not offered; the hint says why. */
  disabled?: boolean;
}

interface MoreMenuProps {
  /** "mobile": a bottom drawer, without the keyboard shortcuts item. */
  layout?: "desktop" | "mobile";
}

/**
 * The action bar's overflow: hand-offs and surfaces that don't earn a button
 * of their own. A dropdown on desktop, a bottom drawer on phones.
 */
export function MoreMenu({ layout = "desktop" }: MoreMenuProps) {
  const tx = useTranslations("editor.actionBar.moreMenu");
  const t = useTranslations("editor.actionBar.moreMenu");
  const [open, setOpen] = useState(false);
  const { setOpen: openShortcuts } = useKeyboardShortcutsModal();
  const { settings } = useUserSettings();
  const desktop = layout === "desktop";
  const dynamicItem = useMakeDynamicItem();

  const items: MoreItem[] = [
    dynamicItem,
    {
      id: "bulk",
      label: t("makeManyFromACsv"),
      hint: tx("oneCodePerRowOf"),
      icon: TableDocument,
      href: BULK_FROM_EDITOR_HREF,
    },
    {
      id: "photo-check",
      label: t("checkAPhotoOfThe"),
      hint: tx("makeSureThePrintedCode"),
      icon: ScanBarcode,
      run: () => usePhotoScanDialogStore.getState().setOpen(true),
    },
    {
      id: "publish",
      label: t("publishToCommunity"),
      hint: tx("shareThisStyleForOthers"),
      icon: People,
      run: () => useCommunitySheetStore.getState().requestPublish(),
    },
    {
      id: "plugins",
      label: t("useQrdxInFigmaAnd"),
      hint: PLUGINS_HINT && t(`pluginsHint.${PLUGINS_HINT}`),
      icon: Element3,
      href: "/plugins",
      separated: true,
    },
    // Touch screens have no "?" key: the same rule as the old toolbar button.
    ...(desktop
      ? [
          {
            id: "shortcuts",
            label: t("keyboardShortcuts"),
            icon: Keyboard,
            kbd: (settings?.keyboardShortcuts ?? true) ? "?" : undefined,
            run: () => openShortcuts(true),
          } satisfies MoreItem,
        ]
      : []),
  ];

  const trigger = (
    <Button aria-label={t("more")} size="sm" variant="ghost">
      <More className="size-4" />
    </Button>
  );

  if (!desktop) {
    return (
      <Drawer onOpenChange={setOpen} open={open}>
        <TooltipWrapper label={t("more")} asChild>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        </TooltipWrapper>
        <DrawerContent>
          <DrawerHeader className="px-5 pt-3 pb-1 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle>{t("more")}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("moreThingsToDoWith")}
            </DrawerDescription>
          </DrawerHeader>
          <ul className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {items.map((item) => (
              <li key={item.id}>
                {item.separated && <div className="bg-border mx-3 my-1 h-px" />}
                {item.href ? (
                  <Link
                    className={drawerRowClass}
                    href={item.href}
                    onNavigate={() => setOpen(false)}
                  >
                    <ItemBody item={item} />
                  </Link>
                ) : (
                  <button
                    className={drawerRowClass}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.run?.();
                    }}
                    type="button"
                  >
                    <ItemBody item={item} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    // Not modal, so a dialog opened from an item gets the page back cleanly.
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <TooltipWrapper label={t("more")} asChild>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      </TooltipWrapper>
      <DropdownMenuContent align="end" className="w-76 p-1.5">
        {items.map((item) => (
          <MenuEntry item={item} key={item.id} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const drawerRowClass =
  "hover:bg-accent active:bg-accent flex w-full items-start gap-3 rounded-md px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none";

/**
 * "Make it dynamic…": the code builder over the editor for a URL code
 * (signed out: sign-in first, then it opens). Bound to a dynamic code, it
 * opens that code's link options. Other types say why they can't be.
 */
function useMakeDynamicItem(): MoreItem {
  const tx = useTranslations("editor.actionBar.moreMenu");
  const t = useTranslations("editor.actionBar.moreMenu");
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const contentType = useQREditorStore((state) => state.contentType);
  const linked = useDynamicLinkStore(
    (state) => userId !== null && state.code?.userId === userId,
  );
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);

  const blocked = dynamicBlockedReason(contentType);
  if (blocked) {
    return {
      id: "dynamic",
      label: t("makeItDynamic"),
      hint: blocked,
      icon: Flash,
      disabled: true,
    };
  }
  const open = () => {
    if (!userId) {
      openAuthDialog(
        "signin",
        "OPEN_CODE_BUILDER",
        openCodeBuilderIntent("dynamic"),
      );
      return;
    }
    const next = currentBuilderRequest(userId);
    if (next.ok) openPlaygroundBuilder(next.request);
  };
  if (linked) {
    return {
      id: "dynamic",
      label: t("linkOptions"),
      hint: tx("itsShortLinkFolderTags"),
      icon: Flash,
      run: open,
    };
  }
  return {
    id: "dynamic",
    label: t("makeItDynamic"),
    hint: userId ? tx("changeWhereItPointsAfter") : tx("signInToChangeWhere"),
    icon: Flash,
    run: open,
    disabled: isPending,
  };
}

function MenuEntry({ item }: { item: MoreItem }) {
  // A disabled item keeps its reason readable: only the label dims.
  const itemClass =
    "cursor-pointer items-start gap-3 px-2.5 py-2 data-[disabled]:opacity-100";
  let entry: ReactNode;
  if (item.href) {
    entry = (
      <DropdownMenuItem asChild className={itemClass}>
        <Link href={item.href}>
          <ItemBody item={item} />
        </Link>
      </DropdownMenuItem>
    );
  } else {
    entry = (
      <DropdownMenuItem
        className={itemClass}
        disabled={item.disabled}
        onSelect={() => item.run?.()}
      >
        <ItemBody item={item} />
        {item.kbd && (
          <DropdownMenuShortcut className="self-center tracking-normal">
            <Kbd>{item.kbd}</Kbd>
          </DropdownMenuShortcut>
        )}
      </DropdownMenuItem>
    );
  }
  return (
    <>
      {item.separated && <DropdownMenuSeparator />}
      {entry}
    </>
  );
}

function ItemBody({ item }: { item: MoreItem }) {
  const Glyph = item.icon;
  return (
    <>
      <Glyph
        aria-hidden
        className={cn(
          "text-muted-foreground size-4 shrink-0",
          item.hint ? "mt-0.5" : "self-center",
        )}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm leading-tight",
            item.disabled ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {item.label}
        </span>
        {item.hint && (
          <span className="text-muted-foreground text-xs leading-snug">
            {item.hint}
          </span>
        )}
      </span>
    </>
  );
}
