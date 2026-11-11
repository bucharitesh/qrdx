"use client";

import { toast } from "@repo/design-system";
import { Spinner as Loader2 } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { ArrowLeft, ArrowRotateLeft, Global } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  type CodeTypeOptions,
  type CodeTypePage,
  getCodeTypeOptions,
  switchQrCodeKind,
} from "@/actions/code-kind";
import { displayUrl } from "@/app/(app)/dashboard/codes/_components/format";
import {
  TemplateGallery,
  TypeCard,
  useDemoContent,
  useTemplatePreviews,
  useTemplates,
} from "@/app/(app)/dashboard/codes/_components/new-code-dialog";
import {
  listLabels,
  summarizeCarryOver,
} from "@/app/(app)/dashboard/codes/_lib/code-kind-shared";
import { CODE_OPTION_COPY } from "@/app/(app)/dashboard/codes/_lib/code-options";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { useAvailability } from "@/components/availability-provider";
import { InlineLimit } from "@/components/limits/inline-limit";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { offeredPageTypes } from "@/lib/landing/file-page-types";
import { PLAN_NAMES } from "@/lib/pricing";
import { soundEvent } from "@/lib/sound/emit";

type Step =
  | { name: "choose" }
  | { name: "template"; type: string }
  | { name: "redirect" }
  | { name: "restore"; page: CodeTypePage };

type CodeOptionsList = CodeTypeOptions["inactiveAfterSwitch"];

const pageName = (page: { title: string | null; typeLabel: string }) =>
  page.title?.trim() || `Untitled ${page.typeLabel.toLowerCase()}`;

/** Options a switch leaves saved but unused, in one sentence. */
function InactiveNote({
  options,
  to,
}: {
  options: CodeOptionsList;
  to: "page" | "redirect";
}) {
  if (options.length === 0) return null;
  const names = listLabels(options.map((id) => CODE_OPTION_COPY[id].label));
  return (
    <p className="text-muted-foreground text-sm">
      {to === "page"
        ? `${names} only apply to website links.`
        : `${names} only load on hosted pages.`}{" "}
      They stay saved and work again if you switch back.
    </p>
  );
}

function PageRow({
  page,
  onClick,
}: {
  page: CodeTypePage;
  onClick: () => void;
}) {
  return (
    <button
      className="hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-[3px]"
      onClick={onClick}
      type="button"
    >
      <span className="bg-muted/40 text-foreground/80 flex size-9 shrink-0 items-center justify-center rounded-md border">
        <ArrowRotateLeft className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {pageName(page)}
        </span>
        <span className="text-muted-foreground block text-xs">
          {page.typeLabel} page this code opened before
        </span>
      </span>
    </button>
  );
}

/**
 * The code page's "Change type": turn a website link into a hosted page (a
 * new one from a template, or one it opened before), a hosted page into a
 * website link or another page type. The short link never changes.
 */
export function ChangeTypeDialog({
  code,
  open,
  onOpenChange,
}: {
  code: QrCodeView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inWorkspace = useWorkspaceHref();
  const fileStorage = useAvailability().has("fileStorage");
  const showLimit = useShowLimit();
  const templates = useTemplates(open);
  const demo = useDemoContent(open);
  const [options, setOptions] = useState<CodeTypeOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ name: "choose" });
  const [variantId, setVariantId] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStep({ name: "choose" });
    setError(null);
    setLoadError(null);
    let cancelled = false;
    getCodeTypeOptions({ id: code.id }).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setLoadError(result.error.message);
        return;
      }
      setOptions(result.data);
      setDestination(result.data.lastDestination ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, code.id]);

  const isPage = code.kind === "page";
  const usage = options?.pageUsage ?? null;
  const atPageLimit =
    usage !== null && usage.limit !== null && usage.used >= usage.limit;
  const template =
    step.name === "template" ? templates?.getTemplate(step.type) : undefined;
  const variant =
    template?.variants.find((item) => item.id === variantId) ??
    template?.variants[0];
  const previews = useTemplatePreviews(templates, demo, template);

  const carry = useMemo(() => {
    if (!(options?.page && templates && template && variant)) return null;
    try {
      const types = templates
        .buildTemplateContent(template.type, variant.id)
        .blocks.map((block) => block.type);
      return summarizeCarryOver(options.page.blocks, types);
    } catch {
      return null;
    }
  }, [options?.page, templates, template, variant]);

  const chooseType = (type: string) => {
    if (atPageLimit) {
      showLimit("landingPages", { used: usage?.used });
      return;
    }
    setVariantId(null);
    setError(null);
    setStep({ name: "template", type });
  };

  const done = (message: string) => {
    soundEvent("success");
    toast.success(message);
    onOpenChange(false);
    router.refresh();
  };

  const fail = (message: string) => {
    soundEvent("error");
    setError(message);
  };

  const switchToRedirect = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await switchQrCodeKind({
        id: code.id,
        kind: "redirect",
        destinationUrl: destination,
      });
      if (!result.success) return fail(result.error.message);
      done("Scans now go to the website link.");
    });
  };

  const switchToPage = (page: CodeTypePage) => {
    setError(null);
    startTransition(async () => {
      const result = await switchQrCodeKind({
        id: code.id,
        kind: "page",
        pageId: page.id,
      });
      if (!result.success) return fail(result.error.message);
      done(`Scans now open ${pageName(page)}.`);
    });
  };

  const openEditor = () => {
    if (!(template && variant)) return;
    const query = new URLSearchParams({
      type: template.type,
      variant: variant.id,
    });
    onOpenChange(false);
    router.push(
      inWorkspace(`/codes/${encodeURIComponent(code.id)}/change-type?${query}`),
    );
  };

  const opensNow = isPage
    ? options?.page
      ? pageName(options.page)
      : "a page that was deleted"
    : displayUrl(code.destinationUrl);

  const back = (
    <Button
      onClick={() => {
        setError(null);
        setStep({ name: "choose" });
      }}
      type="button"
      variant="outline"
    >
      <ArrowLeft />
      Back
    </Button>
  );

  const errorBox = error && (
    <p
      className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
      role="alert"
    >
      {error}
    </p>
  );

  const pageTypes = templates
    ? offeredPageTypes(templates.listTemplates(), fileStorage)
    : null;

  let body: ReactNode;
  let footer: ReactNode = null;

  if (loadError) {
    body = (
      <p className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
        {loadError}
      </p>
    );
  } else if (step.name === "choose") {
    body = (
      <div className="-mx-1 min-h-0 space-y-5 overflow-y-auto px-1 py-2">
        {isPage && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Link
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <TypeCard
                description="Send scans straight to a web address"
                icon={Global}
                label="Website link"
                onClick={() => {
                  setError(null);
                  setStep({ name: "redirect" });
                }}
              />
            </div>
          </div>
        )}
        {options && options.previousPages.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Switch back
            </p>
            {options.previousPages.map((page) => (
              <PageRow
                key={page.id}
                onClick={() => {
                  setError(null);
                  setStep({ name: "restore", page });
                }}
                page={page}
              />
            ))}
          </div>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              {isPage ? "Another page type" : "Hosted page"}
            </p>
            {usage && usage.limit !== null && (
              <span className="text-muted-foreground text-xs">
                {usage.used} / {usage.limit} pages ({PLAN_NAMES[usage.plan]})
              </span>
            )}
          </div>
          {atPageLimit && (
            <InlineLimit meterId="landingPages" used={usage?.used} />
          )}
          {pageTypes && options ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {pageTypes.map((item) => (
                <TypeCard
                  description={item.description}
                  icon={item.icon}
                  key={item.type}
                  label={item.label}
                  locked={atPageLimit}
                  onClick={() => chooseType(item.type)}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton className="h-[66px] rounded-lg" key={index} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } else if (step.name === "template") {
    body = (
      <div className="-mx-1 min-h-0 space-y-4 overflow-y-auto px-1 py-2">
        <div className="bg-muted space-y-2 rounded-md p-3 text-sm">
          {isPage && options?.page ? (
            <>
              <p>
                {carry && carry.carried.length > 0
                  ? `Comes along: the page name, settings and logo, plus ${listLabels(carry.carried)}.`
                  : "Comes along: the page name, settings and logo."}
              </p>
              {carry && carry.left.length > 0 && (
                <p>
                  Not in this template: {listLabels(carry.left)}.{" "}
                  {carry.left.length === 1 ? "It stays" : "They stay"} on your
                  current page.
                </p>
              )}
              <p className="text-muted-foreground">
                {pageName(options.page)} stays in Pages, so you can switch back.
                Scans keep opening it until you publish the new page.
              </p>
            </>
          ) : (
            <p>
              You edit the page next. Scans keep going to {opensNow} until you
              publish it.
            </p>
          )}
          {!isPage && options && (
            <InactiveNote options={options.inactiveAfterSwitch} to="page" />
          )}
        </div>
        {template ? (
          <TemplateGallery
            onSelect={setVariantId}
            previews={previews}
            selected={variant?.id ?? null}
            type={template.type}
          />
        ) : (
          <Skeleton className="h-64 rounded-lg" />
        )}
      </div>
    );
    footer = (
      <>
        {back}
        <Button disabled={!(template && variant)} onClick={openEditor}>
          Continue to editor
        </Button>
      </>
    );
  } else if (step.name === "redirect") {
    body = (
      <form
        className="space-y-4 py-2"
        id="change-type-redirect"
        onSubmit={switchToRedirect}
      >
        <div className="space-y-1.5">
          <Label htmlFor="change-type-destination">Destination URL</Label>
          <Input
            autoFocus
            id="change-type-destination"
            inputMode="url"
            maxLength={2048}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="https://example.com"
            required
            value={destination}
          />
        </div>
        <div className="bg-muted space-y-2 rounded-md p-3 text-sm">
          <p>
            {options?.page
              ? `${pageName(options.page)} stays in Pages, so you can switch back later. It counts toward your hosted pages until you delete it.`
              : "Scans go straight to this address."}
          </p>
          {options && (
            <InactiveNote options={options.inactiveAfterSwitch} to="redirect" />
          )}
        </div>
        {errorBox}
      </form>
    );
    footer = (
      <>
        {back}
        <Button
          disabled={isPending || !destination.trim()}
          form="change-type-redirect"
          type="submit"
        >
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "Switching..." : "Switch to website link"}
        </Button>
      </>
    );
  } else {
    const { page } = step;
    body = (
      <div className="space-y-4 py-2">
        <div className="bg-muted space-y-2 rounded-md p-3 text-sm">
          <p>
            Scans open {pageName(page)} ({page.typeLabel}) again, as it was last
            published. Edit it any time from Pages.
          </p>
          {isPage && options?.page && (
            <p>{pageName(options.page)} stays in Pages.</p>
          )}
          {!isPage && options && (
            <InactiveNote options={options.inactiveAfterSwitch} to="page" />
          )}
        </div>
        {errorBox}
      </div>
    );
    footer = (
      <>
        {back}
        <Button disabled={isPending} onClick={() => switchToPage(page)}>
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "Switching..." : "Switch to this page"}
        </Button>
      </>
    );
  }

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent
        className="flex flex-col overflow-hidden p-6 sm:max-w-3xl"
        showCloseButton
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {step.name === "template" && template
              ? `Switch to a ${template.label.toLowerCase()} page`
              : step.name === "redirect"
                ? "Switch to a website link"
                : step.name === "restore"
                  ? "Switch back to a page"
                  : "Change what this code opens"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {step.name === "template"
              ? "Pick a starting point. You can change every block, color and text in the editor."
              : `The short link and printed codes stay the same, and scans keep counting here. It opens ${opensNow} now.`}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {body}
        {footer && (
          <ResponsiveDialogFooter className="gap-2">
            {footer}
          </ResponsiveDialogFooter>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
