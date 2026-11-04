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
import {
  Chart as ChartNoAxesColumn,
  Copy,
  ExportSquare as ExternalLink,
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
import { CapMeter } from "@/components/limits/cap-meter";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { track } from "@/lib/analytics";
import { PLAN_NAMES } from "@/lib/pricing";

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
  /** Open the dialog on this page type right away (`…/pages?new=menu`) */
  autoOpenType?: string;
  /** ...with this template selected (`&template=cafe`, from a template demo) */
  autoOpenVariant?: string;
} & ComponentProps<typeof Button>) {
  const inWorkspace = useWorkspaceHref();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [initialType, setInitialType] = useState<string | null>(null);
  const [initialVariant, setInitialVariant] = useState<string | null>(null);
  const showLimit = useShowLimit();

  // Arriving from the editor's type picker: open on that type, then drop
  // `?new=` so a refresh doesn't reopen it.
  useEffect(() => {
    if (!autoOpenType) return;
    router.replace(inWorkspace("/pages"), { scroll: false });
    if (isAtLimit(usage)) {
      showLimit("landingPages", { used: usage.used });
      return;
    }
    setInitialType(autoOpenType);
    setInitialVariant(autoOpenVariant ?? null);
    setOpen(true);
  }, [autoOpenType, autoOpenVariant, usage, router, showLimit, inWorkspace]);
  return (
    <>
      <Button
        onClick={() => {
          // The server would refuse it (LIMIT_REACHED): show the limit.
          if (isAtLimit(usage)) {
            showLimit("landingPages", { used: usage.used });
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
  if (usage.limit === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {usage.used} {usage.used === 1 ? "page" : "pages"} ·{" "}
        {PLAN_NAMES[usage.plan]} plan, unlimited pages
      </p>
    );
  }
  return (
    <CapMeter
      limit={usage.limit}
      meterId="landingPages"
      note={`Free pages show a small "Made with QRdx" footer. Existing pages keep working on every plan.`}
      plan={usage.plan}
      source="pages_meter"
      used={usage.used}
    />
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
  const inWorkspace = useWorkspaceHref();
  const router = useRouter();
  const showLimit = useShowLimit();
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
        if (result.error.code === "LIMIT_REACHED") {
          showLimit("dynamicCodes", { message: result.error.message });
        } else {
          toast.error(result.error.message);
        }
        return;
      }
      track("dynamic_code_created", { source: "page" });
      toast.success("QR code created");
      router.push(
        inWorkspace(`/codes/${encodeURIComponent(result.data.codeId)}`),
      );
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
                <Link
                  href={inWorkspace(`/codes/${encodeURIComponent(code.id)}`)}
                >
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
                href={inWorkspace(
                  `/pages/${encodeURIComponent(page.id)}/responses`,
                )}
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
