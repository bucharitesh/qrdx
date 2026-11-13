"use client";

// New barcodes, in the code builder's dialog (builder-shell.tsx). Left: the
// type, what it encodes, a title and a folder. Right: the live barcode with
// its scan check, and its design. Footer: Save. Once saved it shows the
// barcode with its downloads, like a new dynamic code. Opened through
// openCodeBuilder({ mode: "barcode" }); the form, the drawing and what Save
// stores are the barcode page's (barcodes/_components/barcode-editor.tsx).

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import useMediaQuery from "@repo/design-system/hooks/use-media-query";
import { ArrowLeft, Brush2, ExportSquare } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  listBarcodeFolders,
  type SavedBarcodeRef,
  saveBarcode,
} from "@/actions/barcodes";
import {
  BarcodeContentFields,
  BarcodeDetailsFields,
  BarcodeDownloads,
  BarcodePreview,
  BarcodeStyleFields,
  barcodeSaveFields,
  type CurrentBarcode,
  useBarcodeGenerator,
} from "@/app/(app)/dashboard/barcodes/_components/barcode-editor";
import type { FolderOption } from "@/app/(app)/dashboard/barcodes/_lib/filters";
import { CopyButton } from "@/components/copy-button";
import {
  LocaleLink as Link,
  useLocaleRouter as useRouter,
} from "@/components/i18n/locale-link";
import { track } from "@/lib/analytics";
import { getBarcodeFormat } from "@/lib/barcode/formats";
import { soundEvent } from "@/lib/sound/emit";
import { workspaceHref } from "@/lib/workspace-paths";
import {
  addressAfterClose,
  type BarcodeBuilderRequest,
} from "./barcode-request";
import {
  BuilderAlertContent,
  BuilderShell,
  BuilderSubmitKey,
  useBuilderShortcuts,
} from "./builder-shell";
import { escapeAction } from "./shortcuts";

const FORM_ID = "barcode-builder-form";

export default function BarcodeBuilderModal({
  request,
  onClosed,
}: {
  request: BarcodeBuilderRequest;
  onClosed: () => void;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodeBuilder");
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 768px)") ?? true;
  const generator = useBarcodeGenerator({ source: "dashboard" });
  const [open, setOpen] = useState(true);
  /** Phones: the design choices replace the form */
  const [designOpen, setDesignOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  /** The workspace's folders; null while loading */
  const [folders, setFolders] = useState<FolderOption[] | null>(null);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    ref: SavedBarcodeRef;
    barcode: CurrentBarcode;
  } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [isPending, startTransition] = useTransition();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const failed = (message: string) => {
      if (cancelled) return;
      // Saved without a folder; the list can move it later.
      setFolders([]);
      setFoldersError(message);
    };
    listBarcodeFolders()
      .then((result) => {
        if (cancelled) return;
        if (result.success) setFolders(result.data);
        else failed(t("foldersDidntLoad"));
      })
      .catch(() => failed(t("foldersDidntLoad")));
    return () => {
      cancelled = true;
    };
  }, [t]);

  const phase = saved ? "success" : "form";
  const designShown = designOpen && !wide && phase === "form";
  const dirty =
    phase === "form" &&
    (generator.changed || title.trim() !== "" || folderId !== null);

  // ─── Closing ──────────────────────────────────────────────────────────────

  /** `leaving`: off to the new barcode's page, so the address stays put. */
  const finishClose = ({ leaving = false }: { leaving?: boolean } = {}) => {
    setConfirmClose(false);
    setOpen(false);
    if (leaving) return;
    const to = addressAfterClose(request, window.location.pathname);
    // The list is already showing: change the address without loading it again.
    if (to) window.history.replaceState(null, "", to);
  };

  // Unmount after the closing animation.
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(onClosed, 200);
    return () => clearTimeout(timer);
  }, [open, onClosed]);

  const requestClose = () => {
    if (isPending) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    finishClose();
  };

  const onEscape = () => {
    const action = escapeAction({
      panelOpen: designShown,
      dirty,
      busy: isPending,
    });
    if (action === "close-panel") setDesignOpen(false);
    else if (action === "confirm-close") setConfirmClose(true);
    else if (action === "close") finishClose();
  };

  // ─── Saving ───────────────────────────────────────────────────────────────

  const submit = () => {
    if (isPending || phase !== "form") return;
    const current = generator.current;
    if (!current) {
      // The problem is already under the value: take the cursor there.
      if (generator.error) {
        soundEvent("error");
        document.getElementById(generator.inputId)?.focus();
      }
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveBarcode(
        barcodeSaveFields(current, title, folderId),
      ).catch(() => null);
      if (!result?.success) {
        soundEvent("error");
        setError(result ? result.error.message : t("couldntReachQrdx"));
        return;
      }
      soundEvent("success");
      track("barcode_saved", {
        symbology: current.format,
        source: "dashboard",
      });
      // The list underneath shows it.
      router.refresh();
      setSaved({ ref: result.data, barcode: current });
    });
  };

  const startAnother = () => {
    generator.reset();
    setTitle("");
    setFolderId(null);
    setError(null);
    setDesignOpen(false);
    setSaved(null);
  };

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  useBuilderShortcuts({
    enabled: open && !confirmClose,
    contentRef,
    context: {
      singleKeys: false,
      options: [],
      busy: isPending,
      formShown: phase === "form" && !designShown,
    },
    onAction: (action) => {
      if (action.type === "submit") submit();
    },
  });

  // ─── Pieces ───────────────────────────────────────────────────────────────

  const designButton = phase === "form" && !designShown && (
    <Button
      onClick={() => setDesignOpen(true)}
      size="sm"
      type="button"
      variant="outline"
    >
      <Brush2 aria-hidden />
      {t("design")}
    </Button>
  );

  const successBody = saved && (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>{t("value")}</Label>
        <div className="flex items-center gap-1">
          <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm">
            {saved.barcode.value}
          </code>
          <CopyButton
            className="size-8"
            successMessage={{ title: t("valueCopied") }}
            textToCopy={saved.barcode.value}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("type")}</Label>
        <p className="text-muted-foreground text-sm">
          {getBarcodeFormat(saved.barcode.format).label}
        </p>
      </div>
      {saved.ref.title && (
        <div className="space-y-1.5">
          <Label>{t("title")}</Label>
          <p className="text-muted-foreground text-sm break-words">
            {saved.ref.title}
          </p>
        </div>
      )}
      {!wide && <BarcodeDownloads state={generator} />}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link
            href={workspaceHref(
              saved.ref.workspace.slug,
              `/barcodes/${encodeURIComponent(saved.ref.id)}`,
            )}
            onClick={() => finishClose({ leaving: true })}
          >
            <ExportSquare aria-hidden />
            {t("openTheBarcode")}
          </Link>
        </Button>
      </div>
    </div>
  );

  let main: ReactNode;
  if (designShown) {
    main = (
      <div className="space-y-3">
        <Button
          className="-ml-2"
          onClick={() => setDesignOpen(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden />
          {t("back")}
        </Button>
        <div className="-mx-4 space-y-5 border-y p-4">
          <BarcodeStyleFields state={generator} />
        </div>
      </div>
    );
  } else if (successBody) {
    main = successBody;
  } else {
    main = (
      <form
        className="space-y-5"
        id={FORM_ID}
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          submit();
        }}
      >
        <BarcodeContentFields autoFocus={wide} state={generator} />
        <BarcodeDetailsFields
          disabled={isPending}
          folderId={folderId}
          folders={folders}
          onFolderChange={setFolderId}
          onTitleChange={setTitle}
          title={title}
        />
        {foldersError && (
          <p className="text-muted-foreground text-xs" role="status">
            {foldersError}
          </p>
        )}
        {error && (
          <p
            className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <>
      <BuilderShell
        aside={
          wide && (
            <>
              <div className="shrink-0 space-y-3 p-4">
                <BarcodePreview state={generator} />
              </div>
              {phase === "success" ? (
                <div className="px-4 pb-4">
                  <BarcodeDownloads state={generator} />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto border-t">
                  <div className="space-y-5 p-4">
                    <BarcodeStyleFields state={generator} />
                  </div>
                </div>
              )}
            </>
          )
        }
        closeLabel={t("close")}
        contentRef={contentRef}
        description={
          phase === "success"
            ? t("downloadItNowOrOpen")
            : t("pickTheTypeEnterThe")
        }
        footerEnd={
          phase === "success" ? (
            <>
              <Button onClick={startAnother} type="button" variant="outline">
                {t("createAnother")}
              </Button>
              <Button onClick={() => finishClose()} type="button">
                {t("done")}
              </Button>
            </>
          ) : (
            <Button
              aria-keyshortcuts="Meta+Enter Control+Enter"
              className="max-md:w-full"
              disabled={isPending || designShown}
              form={FORM_ID}
              type="submit"
            >
              {isPending ? t("saving") : t("saveBarcode")}
              {!isPending && <BuilderSubmitKey />}
            </Button>
          )
        }
        footerStart={
          phase === "form" &&
          generator.error && (
            <p className="text-muted-foreground text-xs">
              {t("fixTheHighlightedInputTo")}
            </p>
          )
        }
        onEscape={onEscape}
        onRequestClose={requestClose}
        open={open}
        title={phase === "success" ? t("yourBarcodeIsSaved") : t("newBarcode")}
        top={
          !wide && (
            <BarcodePreview action={designButton} compact state={generator} />
          )
        }
      >
        {main}
      </BuilderShell>

      <AlertDialog
        onOpenChange={(next) => {
          if (!next) setConfirmClose(false);
        }}
        open={confirmClose}
      >
        <BuilderAlertContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("closeWithoutSaving")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("thisBarcodeIsntSavedYet")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => finishClose()}>
              {t("discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </BuilderAlertContent>
      </AlertDialog>
    </>
  );
}
