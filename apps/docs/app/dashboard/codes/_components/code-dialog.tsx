"use client";

import { toast } from "@repo/design-system";
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
import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft, ColorSwatch as Palette } from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createQrCode, updateQrCode } from "@/actions/qr-codes";
import type {
  CodeKind,
  CodeOptionId,
} from "@/app/dashboard/codes/_lib/code-options";
import { codeTabHref } from "@/app/dashboard/codes/_lib/code-tabs";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { PanelFallback } from "@/app/dashboard/codes/[id]/_components/routing-panel";
import { CopyButton } from "@/components/copy-button";
import { AccountSourcePicker } from "@/components/data-connections/source-picker";
import { normalizeDestination } from "@/components/editor/dynamic-link-toggle";
import { InfoHint } from "@/components/help/info-hint";
import { track } from "@/lib/analytics";
import { PLAN_NAMES } from "@/lib/pricing";
import { soundEvent } from "@/lib/sound/emit";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  CodeOptionPanel,
  CodeOptionPlanNote,
  CodeOptionsField,
  useCodeOptions,
} from "./code-options";
import { CodeDownloadButtons, CodeQr } from "./code-qr";
import { DomainPicker, useDomainOptions } from "./domain-picker";
import { SlugField, useSlugCheck } from "./slug-field";
import { useOpenInPlayground } from "./use-open-in-playground";

interface CodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this code; omitted = create a new one */
  code?: QrCodeView;
}

export function CodeDialog({ open, onOpenChange, code }: CodeDialogProps) {
  const router = useRouter();
  const openInPlayground = useOpenInPlayground();
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const [destination, setDestination] = useState("");
  const [title, setTitle] = useState("");
  const [domainId, setDomainId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [created, setCreated] = useState<QrCodeView | null>(null);
  /** The option whose panel is open in place of the form */
  const [option, setOption] = useState<CodeOptionId | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const domainOptions = useDomainOptions(open);

  // Reset only as the dialog opens: panels refresh the page when they save,
  // which hands in a new `code` object while an option is open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDestination(code?.destinationUrl ?? "");
      setTitle(code?.title ?? "");
      setDomainId(code?.domain?.id ?? null);
      setSlug(code?.slug ?? "");
      setCreated(null);
      setOption(null);
      setError(null);
    }
    wasOpen.current = open;
  }, [open, code]);

  const preview = code ?? created;
  const codeId = preview?.id ?? null;
  const kind: CodeKind = code?.kind === "page" ? "page" : "redirect";
  const options = useCodeOptions(open, codeId);
  const domainChanged =
    Boolean(code) && domainId !== (code?.domain?.id ?? null);
  const typedSlug = slug.trim();
  // Editing: an empty field or the code's own back-half keeps the current one.
  const slugChanged = Boolean(typedSlug) && typedSlug !== (code?.slug ?? "");
  const customSlugs = domainOptions?.customSlugs ?? false;
  const slugStatus = useSlugCheck({
    slug: typedSlug,
    domainId,
    codeId: code?.id,
    unchanged: !slugChanged,
    enabled: customSlugs,
  });
  const slugHost =
    (domainId &&
      domainOptions?.domains.find((domain) => domain.id === domainId)
        ?.hostname) ||
    (domainId && code?.domain?.id === domainId ? code.domain.hostname : null);
  const slugPrefix = slugHost
    ? `${slugHost}/`
    : `${domainOptions?.defaultHost ?? "qrdx.dev"}/q/`;

  const isPage = code?.kind === "page";

  /** Saves the form; `thenOpen` opens that option once a new code exists. */
  const submit = (event?: FormEvent, thenOpen?: CodeOptionId) => {
    event?.preventDefault();
    const destinationUrl = isPage
      ? code?.destinationUrl
      : normalizeDestination(destination);
    if (!destinationUrl) {
      setError({
        code: "VALIDATION_ERROR",
        message: "Enter a web address, for example https://example.com",
      });
      return;
    }
    if (slugChanged && slugStatus.state === "blocked") {
      setError({ code: "INVALID_SLUG", message: slugStatus.message });
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = code
        ? await updateQrCode({
            id: code.id,
            // Page codes point at their hosted page; it's edited in the page editor.
            ...(!isPage && { destinationUrl }),
            title,
            // Only when changed: editing stays allowed after a downgrade.
            ...(domainChanged && { domainId }),
            ...(slugChanged && { slug: typedSlug }),
          })
        : await createQrCode({
            destinationUrl,
            title,
            domainId,
            slug: slugChanged ? typedSlug : null,
          });
      if (!result.success) {
        setError(result.error);
        soundEvent("error");
        return;
      }
      router.refresh();
      soundEvent(code ? "apply" : "success");
      if (code) {
        toast.success(
          "Changes saved",
          result.data.shortLink !== code.shortLink
            ? {
                description: `Download the QR code again: it now encodes ${result.data.shortLink}.`,
              }
            : { description: "Scans now open the updated destination." },
        );
        onOpenChange(false);
      } else {
        setCreated(result.data);
        if (thenOpen) setOption(thenOpen);
        track("dynamic_code_created", { source: "dashboard" });
      }
    });
  };

  const selectOption = (id: CodeOptionId) => {
    const access = options.plans?.options[id];
    if (!access) return;
    // An option off the plan only explains which plan unlocks it.
    if (codeId || !access.included) {
      setOption(id);
      return;
    }
    submit(undefined, id);
  };

  const closeOption = () => {
    setOption(null);
    // Panels save on their own; show what they saved on the buttons.
    options.reload();
  };

  const optionsField = (
    <CodeOptionsField
      creating={!codeId}
      disabled={isPending}
      kind={kind}
      onSelect={selectOption}
      options={options}
    />
  );

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent
        // Panels can be taller than the screen: the body scrolls so the
        // header and footer stay in view.
        className={cn(
          "flex flex-col overflow-hidden p-6",
          option ? "sm:max-w-3xl" : "sm:max-w-2xl",
        )}
        showCloseButton
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {code
              ? "Edit dynamic QR code"
              : created
                ? "Your dynamic QR code is ready"
                : "New dynamic QR code"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {option && options.plans ? (
              <CodeOptionPlanNote option={option} plans={options.plans} />
            ) : created ? (
              "Download it and print it anywhere. You can change where it points at any time."
            ) : (
              "The QR code encodes a short link, so you can change the destination after printing."
            )}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {option ? (
          <div className="-mx-1 min-h-0 overflow-y-auto px-1 py-2">
            {options.ready && options.plans ? (
              <CodeOptionPanel
                lifecycle={options.data?.lifecycle ?? null}
                marketing={options.marketing}
                option={option}
                plans={options.plans}
              />
            ) : options.error ? (
              <p className="text-destructive text-sm" role="alert">
                {options.error}
              </p>
            ) : (
              <PanelFallback />
            )}
          </div>
        ) : (
          <div className="-mx-1 grid min-h-0 gap-6 overflow-y-auto px-1 py-4 md:grid-cols-[1fr_220px]">
            {created ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Short link</Label>
                  <div className="flex items-center gap-1">
                    <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm">
                      {created.shortLink}
                    </code>
                    <CopyButton
                      className="size-8"
                      successMessage={{ title: "Short link copied" }}
                      textToCopy={created.shortLink}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Opens</Label>
                  <p className="text-muted-foreground text-sm break-all">
                    {created.destinationUrl}
                  </p>
                </div>
              </div>
            ) : (
              <form className="space-y-4" id="code-form" onSubmit={submit}>
                {isPage ? (
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="text-muted-foreground">
                      This code opens a hosted page.
                    </p>
                    {code?.pageId && (
                      <Link
                        className="font-medium underline underline-offset-4"
                        href={`/dashboard/pages/${code.pageId}`}
                      >
                        Edit page
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="code-destination">Destination URL</Label>
                      <InfoHint align="start" id="dynamic-destination" />
                    </div>
                    <Input
                      autoFocus
                      id="code-destination"
                      inputMode="url"
                      maxLength={2048}
                      onChange={(event) => setDestination(event.target.value)}
                      placeholder="https://example.com/menu"
                      required
                      value={destination}
                    />
                    <AccountSourcePicker
                      contentType="url"
                      onPick={(item) => setDestination(item.url)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="code-title">
                    Title{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="code-title"
                    maxLength={100}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Table tent, spring menu"
                    value={title}
                  />
                </div>
                <DomainPicker
                  current={code?.domain ?? null}
                  disabled={isPending}
                  onChange={setDomainId}
                  options={domainOptions}
                  value={domainId}
                />
                {domainOptions && (
                  <SlugField
                    allowed={customSlugs}
                    disabled={isPending}
                    editing={Boolean(code)}
                    onChange={setSlug}
                    onUpgrade={openGetProDialog}
                    prefix={slugPrefix}
                    status={slugStatus}
                    value={slug}
                  />
                )}
                {domainChanged && !slugChanged && (
                  <p
                    className={
                      code?.domain?.verified || !code?.defaultShortLink
                        ? "bg-destructive/10 text-destructive rounded-md p-3 text-sm"
                        : "bg-muted rounded-md p-3 text-sm"
                    }
                  >
                    {code?.domain?.verified
                      ? code.defaultShortLink
                        ? `QR codes already printed with ${code.shortLink} will stop working. Codes printed with ${code.defaultShortLink} keep working.`
                        : `QR codes already printed with ${code.shortLink} will stop working. Its back-half moves with the code when it's free there, otherwise the code gets a new one.`
                      : "The QR code changes to the new link, so download it again after saving. Codes you already printed keep working."}
                  </p>
                )}
                {error && (
                  <div
                    className="bg-destructive/10 text-destructive space-y-2 rounded-md p-3 text-sm"
                    role="alert"
                  >
                    <p>{error.message}</p>
                    {(error.code === "LIMIT_REACHED" ||
                      error.code === "PLAN_REQUIRED") && (
                      <Button
                        onClick={openGetProDialog}
                        size="sm"
                        type="button"
                      >
                        {/* The message names the plan a PLAN_REQUIRED needs. */}
                        {error.code === "LIMIT_REACHED" &&
                        options.plans?.upgrades.unlimitedCodes
                          ? `Upgrade to ${PLAN_NAMES[options.plans.upgrades.unlimitedCodes]}`
                          : "Upgrade"}
                      </Button>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* Without a code, the placeholder is hidden on phones, where it
                would push the options out of view. */}
            <div className={cn("space-y-3", !preview && "hidden md:block")}>
              {preview ? (
                <>
                  <CodeQr
                    className="bg-muted/40 rounded-lg border p-3"
                    style={preview.style}
                    value={preview.shortLink}
                  />
                  <CodeDownloadButtons code={preview} />
                  <Button
                    className="w-full"
                    onClick={() => openInPlayground(preview)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Palette />
                    Edit design in playground
                  </Button>
                </>
              ) : (
                <div className="text-muted-foreground flex aspect-square items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
                  Your QR code appears here once it's created.
                </div>
              )}
            </div>
            {/* Full width, under the form and the QR code. */}
            <div className="md:col-span-2">{optionsField}</div>
          </div>
        )}

        <ResponsiveDialogFooter className="gap-2">
          {option ? (
            <Button onClick={closeOption} type="button" variant="outline">
              <ArrowLeft />
              Back
            </Button>
          ) : created ? (
            <>
              <Button asChild variant="outline">
                <Link href={codeTabHref(created.id, "analytics")}>
                  View analytics
                </Link>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Cancel
              </Button>
              <Button disabled={isPending} form="code-form" type="submit">
                {isPending
                  ? "Saving..."
                  : code
                    ? "Save changes"
                    : "Create code"}
              </Button>
            </>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
