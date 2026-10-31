"use client";

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
import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft, Gem, Link2, Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  createLandingPage,
  getLandingPageUsage,
} from "@/actions/landing-pages";
import type { PageUsage } from "@/app/dashboard/pages/_lib/landing-pages";
import { LandingRender } from "@/components/landing/render";
import { ScaledPreview } from "@/components/landing/scaled-preview";
import type { PageTemplate } from "@/lib/landing/templates";
import { PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { CodeDialog } from "./code-dialog";

type TemplatesModule = typeof import("@/lib/landing/templates");

/** Loads the page types (and every block) only when the picker opens. */
function useTemplates(open: boolean) {
  const [mod, setMod] = useState<TemplatesModule | null>(null);
  useEffect(() => {
    if (!open || mod) return;
    let cancelled = false;
    import("@/lib/landing/templates").then((loaded) => {
      if (!cancelled) setMod(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [open, mod]);
  return mod;
}

function usePageUsage(open: boolean) {
  const [usage, setUsage] = useState<PageUsage | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getLandingPageUsage().then((result) => {
      if (!cancelled && result.success) setUsage(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);
  return usage;
}

function TypeCard({
  icon: Icon,
  label,
  description,
  locked,
  onClick,
}: {
  icon: PageTemplate["icon"];
  label: string;
  description: string;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="hover:bg-muted/60 focus-visible:ring-ring/50 flex items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-[3px]"
      onClick={onClick}
      type="button"
    >
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          {locked && <Lock className="text-muted-foreground size-3.5" />}
        </span>
        <span className="text-muted-foreground block text-xs leading-snug">
          {description}
        </span>
      </span>
    </button>
  );
}

/**
 * "New code" flow: a plain website link (redirect) or a hosted page type
 * from the template registry, then a template from its gallery.
 */
export function NewCodeDialog({
  open,
  onOpenChange,
  pagesOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hide the website link option (the Pages screen) */
  pagesOnly?: boolean;
}) {
  const router = useRouter();
  const templates = useTemplates(open);
  const usage = usePageUsage(open);
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  const [linkOpen, setLinkOpen] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setType(null);
      setVariantId(null);
      setTitle("");
      setError(null);
    }
  }, [open]);

  const atPageLimit =
    usage !== null && usage.limit !== null && usage.used >= usage.limit;
  const template = type ? templates?.getTemplate(type) : undefined;
  const variant =
    template?.variants.find((item) => item.id === variantId) ??
    template?.variants[0];

  const previews = useMemo(() => {
    if (!(templates && template)) return [];
    return template.variants.map((item) => {
      try {
        return {
          variant: item,
          content: templates.buildTemplateContent(template.type, item.id),
        };
      } catch {
        return { variant: item, content: null };
      }
    });
  }, [templates, template]);

  const chooseType = (next: string) => {
    if (atPageLimit) {
      openUpgradeDialog("pro");
      return;
    }
    setType(next);
    setVariantId(null);
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!(template && variant)) return;
    setError(null);
    startTransition(async () => {
      const result = await createLandingPage({
        type: template.type,
        variantId: variant.id,
        title: title.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      router.push(`/dashboard/pages/${encodeURIComponent(result.data.pageId)}`);
    });
  };

  return (
    <>
      <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
        <ResponsiveDialogContent className="p-6 sm:max-w-3xl" showCloseButton>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {template
                ? `New ${template.label.toLowerCase()} page`
                : pagesOnly
                  ? "New page"
                  : "New dynamic QR code"}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {template
                ? "Pick a starting point. You can change every block, color and text afterwards."
                : "What should people see when they scan it? You can edit it after printing."}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          {!template ? (
            <div className="space-y-4 py-2">
              {!pagesOnly && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Link
                  </p>
                  <TypeCard
                    description="Send scans to any web address, and change it anytime"
                    icon={Link2}
                    label="Website link"
                    onClick={() => {
                      onOpenChange(false);
                      setLinkOpen(true);
                    }}
                  />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Hosted page
                  </p>
                  {usage && usage.limit !== null && (
                    <span className="text-muted-foreground text-xs">
                      {usage.used} / {usage.limit} pages (
                      {PLAN_NAMES[usage.plan]})
                    </span>
                  )}
                </div>
                {atPageLimit && (
                  <div className="bg-muted flex flex-col gap-2 rounded-md p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Your plan includes {usage?.limit} hosted pages. Existing
                      pages keep working.
                    </span>
                    <Button onClick={() => openUpgradeDialog("pro")} size="sm">
                      <Gem />
                      Upgrade for unlimited
                    </Button>
                  </div>
                )}
                {templates ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {templates.listTemplates().map((item) => (
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
          ) : (
            <form
              className="space-y-4 py-2"
              id="new-page-form"
              onSubmit={submit}
            >
              <fieldset>
                <legend className="sr-only">Template</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {previews.map(({ variant: item, content }) => {
                    const active = item.id === variant?.id;
                    return (
                      <button
                        aria-pressed={active}
                        className={cn(
                          "group space-y-1.5 rounded-lg p-1.5 text-left outline-none",
                          active ? "bg-primary/10" : "hover:bg-muted",
                          "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                        )}
                        key={item.id}
                        onClick={() => setVariantId(item.id)}
                        type="button"
                      >
                        <ScaledPreview
                          className={cn(
                            "bg-muted aspect-[9/16] rounded-md border",
                            active && "ring-primary ring-2",
                          )}
                        >
                          {content && (
                            <LandingRender
                              content={content}
                              context={{
                                theme: content.theme,
                                mode: "preview",
                                pageId: null,
                                qrCodeId: null,
                              }}
                            />
                          )}
                        </ScaledPreview>
                        <span className="block px-0.5 text-sm font-medium">
                          {item.name}
                        </span>
                        {item.description && (
                          <span className="text-muted-foreground block px-0.5 text-xs leading-snug">
                            {item.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="new-page-title">
                  Name{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional, only you see it)
                  </span>
                </Label>
                <Input
                  id="new-page-title"
                  maxLength={100}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={`${template.label}, spring campaign`}
                  value={title}
                />
              </div>
              {error && (
                <div
                  className="bg-destructive/10 text-destructive space-y-2 rounded-md p-3 text-sm"
                  role="alert"
                >
                  <p>{error.message}</p>
                  {(error.code === "LIMIT_REACHED" ||
                    error.code === "PLAN_REQUIRED") && (
                    <Button
                      onClick={() => openUpgradeDialog("pro")}
                      size="sm"
                      type="button"
                    >
                      Upgrade
                    </Button>
                  )}
                </div>
              )}
            </form>
          )}

          {template && (
            <ResponsiveDialogFooter className="gap-2">
              <Button
                onClick={() => setType(null)}
                type="button"
                variant="outline"
              >
                <ArrowLeft />
                Back
              </Button>
              <Button disabled={isPending} form="new-page-form" type="submit">
                {isPending && <Loader2 className="animate-spin" />}
                {isPending ? "Creating..." : "Create page"}
              </Button>
            </ResponsiveDialogFooter>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      {!pagesOnly && <CodeDialog onOpenChange={setLinkOpen} open={linkOpen} />}
    </>
  );
}
