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
import { Separator } from "@repo/design-system/components/ui/separator";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, ArrowLeft, Global, InfoCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { TypeIconTile } from "@/components/editor/content-type-icons";
import { FORMS } from "@/components/editor/control-sections/content-controls";
import { useQREditorStore } from "@/store/editor-store";
import {
  CONTENT_TYPES_METADATA,
  type ContentType,
  type QRContentConfig,
} from "@/types/qr-content";
import {
  contentLabel,
  contentReady,
  linkContent,
  MORE_CONTENT_TYPES,
  QUICK_CONTENT_TYPES,
} from "./content-request";

// What the code opens, asked for in a dialog when a generation needs it and
// the editor has none: a link first, or one of the content types with its
// own form. The forms write to the editor as they always do; Cancel (and
// Back) put back what was there (use-content-dialog.tsx keeps the snapshot).
// Loaded only when a chat card opens it.

const META = new Map(CONTENT_TYPES_METADATA.map((meta) => [meta.type, meta]));

export interface ContentDialogProps {
  open: boolean;
  /** Content is in the editor (its type, never its values) */
  onDone: (type: ContentType) => void;
  /** Closed without content: puts the editor back as it was */
  onCancel: () => void;
  /** Puts back what the editor held when the dialog opened */
  restore: () => void;
}

export function ContentDialog({
  open,
  onDone,
  onCancel,
  restore,
}: ContentDialogProps) {
  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      open={open}
    >
      {/* Phones: a drawer capped at 75% height; the body scrolls, the
          footer stays in view. */}
      <ResponsiveDialogContent className="overflow-hidden shadow-lg max-sm:flex max-sm:flex-col sm:max-w-120">
        {/* Mounted while open: every opening starts fresh. */}
        {open && (
          <ContentDialogBody
            onCancel={onCancel}
            onDone={onDone}
            restore={restore}
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function ContentDialogBody({
  onDone,
  onCancel,
  restore,
}: Omit<ContentDialogProps, "open">) {
  const t = useTranslations("editor.ai.contentDialog");
  const [view, setView] = useState<"pick" | ContentType>("pick");
  const [link, setLink] = useState("");
  const [linkTouched, setLinkTouched] = useState(false);
  const [moreTypes, setMoreTypes] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const helperId = useId();
  const formArea = useRef<HTMLDivElement>(null);

  const chooseType = (type: ContentType) => {
    setProblem(null);
    useQREditorStore.getState().setContentType(type);
    setView(type);
    // The picked tile is gone: focus the form's first field, not the dialog.
    requestAnimationFrame(() =>
      formArea.current
        ?.querySelector<HTMLElement>("input, textarea, [role=combobox]")
        ?.focus(),
    );
  };

  const back = () => {
    restore();
    setProblem(null);
    setView("pick");
  };

  const parsedLink = linkContent(link);

  const submit = () => {
    if (view === "pick") {
      if (!parsedLink.ok) {
        setLinkTouched(true);
        setProblem(
          link.trim()
            ? (parsedLink.message ?? "Check the link.")
            : "Add a link, or choose a type below.",
        );
        return;
      }
      const store = useQREditorStore.getState();
      store.setContentType("url");
      store.setContentConfig("url", parsedLink.config as QRContentConfig);
      store.setValue(parsedLink.value);
      onDone("url");
      return;
    }
    const ready = contentReady(useQREditorStore.getState());
    if (!ready.ok) {
      setProblem(ready.message);
      return;
    }
    onDone(ready.type);
  };

  const Form = view === "pick" ? null : FORMS[view];
  const showLinkError =
    linkTouched && !parsedLink.ok && Boolean(parsedLink.message);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col sm:max-h-[min(720px,calc(100dvh-4rem))]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6 pt-0 sm:pt-6">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t("whatShouldTheCodeOpen")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("addALinkOrChoose")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {view === "pick" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="content-dialog-link">{t("link")}</Label>
              <Input
                aria-describedby={helperId}
                aria-invalid={showLinkError || undefined}
                autoCapitalize="none"
                autoComplete="url"
                autoFocus
                id="content-dialog-link"
                inputMode="url"
                onBlur={() => setLinkTouched(true)}
                onChange={(event) => {
                  setLink(event.target.value);
                  setProblem(null);
                }}
                placeholder="example.com"
                spellCheck={false}
                type="text"
                value={link}
              />
              <p
                aria-live="polite"
                className={cn(
                  "text-muted-foreground flex items-start gap-1.5 text-xs",
                  showLinkError && "text-destructive",
                )}
                id={helperId}
              >
                {showLinkError && !parsedLink.ok ? (
                  <>
                    <InfoCircle className="mt-px size-3.5 shrink-0" />
                    {parsedLink.message}
                  </>
                ) : parsedLink.ok ? (
                  <>
                    <Global className="mt-px size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {t("scansOpen")}
                      <span className="text-foreground">{parsedLink.host}</span>
                    </span>
                  </>
                ) : (
                  t("aWebsiteAMenuA")
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">
                {t("orChooseAType")}
              </span>
              <Separator className="flex-1" />
            </div>

            <div className="space-y-2">
              <TypeGrid onPick={chooseType} types={QUICK_CONTENT_TYPES} />
              {moreTypes ? (
                <TypeGrid onPick={chooseType} types={MORE_CONTENT_TYPES} />
              ) : (
                <Button
                  className="text-muted-foreground hover:text-foreground h-8 w-full gap-1.5 text-xs"
                  onClick={() => setMoreTypes(true)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDown2 className="size-3.5" />
                  {t("lengthMoreTypes", { length: MORE_CONTENT_TYPES.length })}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                aria-label={t("backToAllTypes")}
                className="-ml-2 shrink-0"
                onClick={back}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <TypeIconTile icon={META.get(view)?.icon} type={view} />
              <span className="min-w-0">
                <span className="block text-sm leading-5 font-medium">
                  {contentLabel(view)}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {META.get(view)?.description}
                </span>
              </span>
            </div>
            {/* The Content tab's own form, so its rules and checks apply. */}
            <div ref={formArea}>{Form && <Form key={view} />}</div>
          </div>
        )}

        {problem && (
          <p
            className="text-destructive flex items-start gap-1.5 text-xs"
            role="alert"
          >
            <InfoCircle className="mt-px size-3.5 shrink-0" />
            {problem}
          </p>
        )}
      </div>

      <ResponsiveDialogFooter className="bg-muted/30 border-t px-6 py-4">
        <Button onClick={onCancel} type="button" variant="ghost">
          {t("cancel")}
        </Button>
        <Button type="submit">{t("continue")}</Button>
      </ResponsiveDialogFooter>
    </form>
  );
}

function TypeGrid({
  types,
  onPick,
}: {
  types: ContentType[];
  onPick: (type: ContentType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {types.map((type) => {
        const meta = META.get(type);
        if (!meta) return null;
        return (
          <button
            className={cn(
              "bg-card flex min-w-0 items-center gap-2.5 rounded-lg border p-2 text-left transition-colors outline-none",
              "hover:border-foreground/15 hover:bg-accent/40 focus-visible:border-foreground/25 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
            )}
            key={type}
            onClick={() => onPick(type)}
            type="button"
          >
            <TypeIconTile icon={meta.icon} type={type} />
            <span className="min-w-0 truncate text-sm font-medium">
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
