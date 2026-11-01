"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  Chart as ChartNoAxesColumn,
  Copy,
  ExportSquare as ExternalLink,
  Diamonds as Gem,
  DirectInbox as Inbox,
  More as MoreHorizontal,
  Add as Plus,
  ScanBarcode as QrCode,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useEffect, useState, useTransition } from "react";
import {
  createLandingPageCode,
  deleteLandingPage,
} from "@/actions/landing-pages";
import { NewCodeDialog } from "@/app/dashboard/codes/_components/new-code-dialog";
import type {
  LandingPageListItem,
  PageUsage,
} from "@/app/dashboard/pages/_lib/landing-pages";
import { track } from "@/lib/analytics";
import { PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

const isAtLimit = (usage: PageUsage) =>
  usage.limit !== null && usage.used >= usage.limit;

export function NewPageButton({
  usage,
  children = "New page",
  autoOpenType,
  autoOpenVariant,
  ...props
}: {
  usage: PageUsage;
  /** Open the dialog on this page type right away (`/dashboard/pages?new=menu`) */
  autoOpenType?: string;
  /** ...with this template selected (`&template=cafe`, from a template demo) */
  autoOpenVariant?: string;
} & ComponentProps<typeof Button>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [initialType, setInitialType] = useState<string | null>(null);
  const [initialVariant, setInitialVariant] = useState<string | null>(null);
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );

  // Arriving from the editor's type picker: open on that type, then drop
  // `?new=` so a refresh doesn't reopen it.
  useEffect(() => {
    if (!autoOpenType) return;
    router.replace("/dashboard/pages", { scroll: false });
    if (isAtLimit(usage)) {
      openUpgradeDialog("pro");
      return;
    }
    setInitialType(autoOpenType);
    setInitialVariant(autoOpenVariant ?? null);
    setOpen(true);
  }, [autoOpenType, autoOpenVariant, usage, router, openUpgradeDialog]);
  return (
    <>
      <Button
        onClick={() => {
          if (isAtLimit(usage)) {
            toast.error(
              `Your plan includes ${usage.limit} hosted pages. Delete one or upgrade to Pro.`,
            );
            openUpgradeDialog("pro");
            return;
          }
          setInitialType(null);
          setInitialVariant(null);
          setOpen(true);
        }}
        {...props}
      >
        <Plus />
        {children}
      </Button>
      <NewCodeDialog
        initialType={initialType}
        initialVariant={initialVariant}
        onOpenChange={setOpen}
        open={open}
        pagesOnly
      />
    </>
  );
}

export function PageUsageMeter({ usage }: { usage: PageUsage }) {
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  if (usage.limit === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {usage.used} {usage.used === 1 ? "page" : "pages"} ·{" "}
        {PLAN_NAMES[usage.plan]} plan, unlimited pages
      </p>
    );
  }
  const percent = Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {usage.used} / {usage.limit} hosted pages ({PLAN_NAMES[usage.plan]})
          </span>
          {isAtLimit(usage) && (
            <span className="text-muted-foreground text-xs">Limit reached</span>
          )}
        </div>
        <Progress aria-label="Hosted pages used" value={percent} />
        <p className="text-muted-foreground text-xs">
          Free pages show a small "Made with QRdx" footer. Existing pages keep
          working on every plan.
        </p>
      </div>
      <Button
        onClick={() => openUpgradeDialog("pro")}
        size="sm"
        variant="outline"
      >
        <Gem />
        Upgrade for unlimited
      </Button>
    </div>
  );
}

const FORM_BLOCKS = new Set(["form", "coupon"]);

export function PageActions({
  page,
  canDelete,
}: {
  page: LandingPageListItem;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [code] = page.codes.filter((item) => !item.inTrash);
  const hasForm = page.blockTypes.some((type) => FORM_BLOCKS.has(type));

  const remove = () =>
    startTransition(async () => {
      const result = await deleteLandingPage({ id: page.id });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setConfirm(false);
      toast.success("Page deleted");
      router.refresh();
    });

  const createCode = () =>
    startTransition(async () => {
      const result = await createLandingPageCode({ id: page.id });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      track("dynamic_code_created", { source: "page" });
      toast.success("QR code created");
      router.push(`/dashboard/codes/${encodeURIComponent(result.data.codeId)}`);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="More actions" size="icon" variant="ghost">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {code ? (
            <>
              <DropdownMenuItem asChild>
                <a href={code.pageUrl} rel="noopener" target="_blank">
                  <ExternalLink />
                  View live page
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard
                    .writeText(code.shortLink)
                    .then(() => toast.success("Short link copied"))
                    .catch(() => toast.error("Couldn't copy the link"));
                }}
              >
                <Copy />
                Copy short link
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/codes/${encodeURIComponent(code.id)}`}>
                  <ChartNoAxesColumn />
                  QR code & analytics
                </Link>
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem disabled={isPending} onSelect={createCode}>
              <QrCode />
              Create a QR code
            </DropdownMenuItem>
          )}
          {hasForm && (
            <DropdownMenuItem asChild>
              <Link
                href={`/dashboard/pages/${encodeURIComponent(page.id)}/responses`}
              >
                <Inbox />
                Responses
              </Link>
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirm(true)}
              >
                <Trash2 />
                Delete page
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setConfirm} open={confirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this page?</AlertDialogTitle>
            <AlertDialogDescription>
              {page.codes.length > 0
                ? `Its ${page.codes.length === 1 ? "QR code is" : `${page.codes.length} QR codes are`} deleted too, with their scan history. Printed copies will stop working. This can't be undone.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
            >
              {isPending ? "Deleting..." : "Delete page"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
