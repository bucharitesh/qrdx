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
  Global as Globe,
  DirectInbox as Inbox,
  More as MoreHorizontal,
  Add as Plus,
  ScanBarcode as QrCode,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ComponentProps, useEffect, useState, useTransition } from "react";
import {
  createLandingPageCode,
  deleteLandingPage,
} from "@/actions/landing-pages";
import { NewCodeDialog } from "@/app/(app)/dashboard/codes/_components/new-code-dialog";
import type {
  LandingPageListItem,
  PageUsage,
} from "@/app/(app)/dashboard/pages/_lib/landing-pages";
// Community: "Publish to community" (owners and admins; the server checks)
import { PublishPageDialog } from "@/components/community/publish-page-dialog";
import { CapMeter } from "@/components/limits/cap-meter";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { useCan, useWorkspaceHref } from "@/components/workspace-provider";
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
  const t = useTranslations("app.dashboard.pages.pageListControls");
  if (usage.limit === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("unlimitedPagesUsage", {
          count: usage.used,
          plan: PLAN_NAMES[usage.plan],
        })}
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
  const t = useTranslations("app.dashboard.pages.pageListControls");
  const inWorkspace = useWorkspaceHref();
  const router = useRouter();
  const showLimit = useShowLimit();
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [code] = page.codes.filter((item) => !item.inTrash);
  const hasForm = page.blockTypes.some((type) => FORM_BLOCKS.has(type));
  // Viewers and billing members can't add a code (lib/permissions.ts).
  const canWrite = useCan("content.write");
  // ── Community: publish as a page template (owners and admins) ──
  const canPublish = useCan("content.manageAll");
  const [publishing, setPublishing] = useState(false);

  const remove = () =>
    startTransition(async () => {
      const result = await deleteLandingPage({ id: page.id });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setConfirm(false);
      toast.success(t("pageDeleted"));
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
      toast.success(t("qrCodeCreated"));
      router.push(
        inWorkspace(`/codes/${encodeURIComponent(result.data.codeId)}`),
      );
    });

  // Nothing to offer a read-only role on a page with no code or form yet.
  if (!(code || hasForm || canDelete || canWrite || canPublish)) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={t("moreActions")} size="icon" variant="ghost">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {code ? (
            <>
              <DropdownMenuItem asChild>
                <a href={code.pageUrl} rel="noopener" target="_blank">
                  <ExternalLink />
                  {t("viewLivePage")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard
                    .writeText(code.shortLink)
                    .then(() => toast.success(t("shortLinkCopied")))
                    .catch(() => toast.error(t("couldntCopyTheLink")));
                }}
              >
                <Copy />
                {t("copyShortLink")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={inWorkspace(`/codes/${encodeURIComponent(code.id)}`)}
                >
                  <ChartNoAxesColumn />
                  {t("qrCodeAnalytics")}
                </Link>
              </DropdownMenuItem>
            </>
          ) : (
            canWrite && (
              <DropdownMenuItem disabled={isPending} onSelect={createCode}>
                <QrCode />
                {t("createAQrCode")}
              </DropdownMenuItem>
            )
          )}
          {hasForm && (
            <DropdownMenuItem asChild>
              <Link
                href={inWorkspace(
                  `/pages/${encodeURIComponent(page.id)}/responses`,
                )}
              >
                <Inbox />
                {t("responses")}
              </Link>
            </DropdownMenuItem>
          )}
          {canPublish && (
            <DropdownMenuItem onSelect={() => setPublishing(true)}>
              <Globe />
              {t("publishToCommunity")}
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
                {t("deletePage")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setConfirm} open={confirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteThisPage")}</AlertDialogTitle>
            <AlertDialogDescription>
              {page.codes.length > 0
                ? `Its ${page.codes.length === 1 ? "QR code is" : `${page.codes.length} QR codes are`} deleted too, with their scan history. Printed copies will stop working. This can't be undone.`
                : t("thisCantBeUndone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
            >
              {isPending ? t("deleting") : t("deletePage")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canPublish && (
        <PublishPageDialog
          onOpenChange={setPublishing}
          open={publishing}
          pageId={page.id}
        />
      )}
    </>
  );
}
