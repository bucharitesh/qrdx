"use client";

// The dynamic QR code builder: a create and edit modal in the shape of Dub's
// link builder (github.com/dubinc/dub, AGPL-3.0:
// apps/web/ui/modals/link-builder/index.tsx), with the QR design first-class.
// Left: what the code opens, its short link, title, folder and tags. Right:
// the live QR with its scan score and quick design choices. Footer: the
// round 4 option buttons and Create. Opened through openCodeBuilder().

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Close } from "@repo/design-system/components/icons";
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
import { Input } from "@repo/design-system/components/ui/input";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import useMediaQuery from "@repo/design-system/hooks/use-media-query";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft,
  Brush2,
  DocumentText1,
  ExportSquare,
  Link2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ScanScoreResult } from "qrdx";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  CodeOptionPanel,
  CodeOptionPlanNote,
  useCodeOptions,
} from "@/app/dashboard/codes/_components/code-options";
import { CodeDownloadButtons } from "@/app/dashboard/codes/_components/code-qr";
import { DomainPicker } from "@/app/dashboard/codes/_components/domain-picker";
import { displayUrl } from "@/app/dashboard/codes/_components/format";
import {
  SlugField,
  useSlugCheck,
} from "@/app/dashboard/codes/_components/slug-field";
import {
  CODE_OPTION_COPY,
  type CodeKind,
  type CodeOptionId,
  codeOptionsFor,
} from "@/app/dashboard/codes/_lib/code-options";
import { codeTabHref } from "@/app/dashboard/codes/_lib/code-tabs";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { PanelFallback } from "@/app/dashboard/codes/[id]/_components/routing-panel";
import type { ShellData } from "@/components/app-shell/shell-data";
import { CopyButton } from "@/components/copy-button";
import { AccountSourcePicker } from "@/components/data-connections/source-picker";
import { InfoHint } from "@/components/help/info-hint";
import { defaultThemeState } from "@/config/qr";
import { track } from "@/lib/analytics";
import { PLAN_NAMES } from "@/lib/pricing";
import { soundEvent } from "@/lib/sound/emit";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { QRStyle } from "@/types/theme";
import { type CodeBuilderData, getCodeBuilderData } from "./actions";
import { BuilderOptionBar, BuilderOptionsOn } from "./builder-options";
import { FolderField, TagsField } from "./builder-organize";
import { BuilderPreview } from "./builder-preview";
import { BuilderStyle } from "./builder-style";
import { DraftControls, type DraftState } from "./draft-controls";
import {
  type CodeDraft,
  DRAFT_DEBOUNCE_MS,
  draftFieldsForStorage,
  hasDraftableContent,
} from "./drafts";
import { openInFullEditor } from "./full-editor";
import { previewLink } from "./links";
import { listItemFromView } from "./optimistic";
import { builderServices, type LoadedCode, loadCodeForEdit } from "./services";
import {
  escapeAction,
  resolveBuilderShortcut,
  submitKeyLabel,
} from "./shortcuts";
import { type CodeBuilderRequest, useCodeBuilderStore } from "./store";
import { type SubmitResult, submitCreate, submitUpdate } from "./submit";
import { type BuilderFields, EMPTY_FIELDS } from "./types";
import { newDraftId, useCodeDrafts } from "./use-code-drafts";
import {
  checkDestination,
  fieldsEqual,
  MAX_TITLE_LENGTH,
  needsUpgrade,
} from "./validation";

type Panel =
  | { type: "option"; option: CodeOptionId }
  /** Phones: the design choices replace the form */
  | { type: "style" };

type Phase = "form" | "success";

type FormError = {
  code: string;
  message: string;
  field: "destination" | "slug" | "domain" | "form";
};

function fieldsFromCode(
  code: QrCodeView,
  organization: LoadedCode["organization"],
): BuilderFields {
  return {
    destination: code.destinationUrl,
    title: code.title ?? "",
    domainId: code.domain?.id ?? null,
    slug: code.slug,
    folderId: organization?.folderId ?? null,
    tagIds: organization?.tagIds ?? [],
    style: code.style,
  };
}

/** The hosted page types, loaded only when "Hosted page" is picked. */
function usePageTypes(enabled: boolean) {
  const [types, setTypes] = useState<
    typeof import("@/lib/landing/templates") | null
  >(null);
  useEffect(() => {
    if (!enabled || types) return;
    let cancelled = false;
    import("@/lib/landing/templates").then((loaded) => {
      if (!cancelled) setTypes(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, types]);
  return types;
}

export default function CodeBuilderModal({
  request,
  usage,
  onClosed,
  onChoosePageType,
}: {
  request: CodeBuilderRequest;
  /** The plan's cap on dynamic codes, from the app shell; null = no cap */
  usage: ShellData["codes"];
  onClosed: () => void;
  /** "Hosted page": continue in the page template gallery */
  onChoosePageType: (type: string) => void;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const workspaceId = session?.session.activeOrganizationId ?? null;
  const wide = useMediaQuery("(min-width: 768px)") ?? true;
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  const putOptimistic = useCodeBuilderStore((state) => state.putOptimistic);
  const dropOptimistic = useCodeBuilderStore((state) => state.dropOptimistic);

  const editing = request.mode === "edit";
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState<LoadedCode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<BuilderFields>(() =>
    request.mode === "create"
      ? { ...EMPTY_FIELDS, ...request.initial }
      : EMPTY_FIELDS,
  );
  const [fields, setFields] = useState<BuilderFields>(initial);
  const [contentType, setContentType] = useState<"link" | "page">("link");
  const [phase, setPhase] = useState<Phase>("form");
  const [created, setCreated] = useState<{
    code: QrCodeView;
    copied: boolean;
    warnings: string[];
  } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [showDestinationError, setShowDestinationError] = useState(false);
  /** Themes, folders, tags, domains and settings; null while loading */
  const [builderData, setBuilderData] = useState<CodeBuilderData | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [score, setScore] = useState<ScanScoreResult | null>(null);
  const [confirm, setConfirm] = useState<
    null | "close" | { lowScore: CodeOptionId | null }
  >(null);
  const [sessionId, setSessionId] = useState(newDraftId);
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [isPending, startTransition] = useTransition();
  const contentRef = useRef<HTMLDivElement>(null);
  const destinationRef = useRef<HTMLInputElement>(null);

  // ─── Loading ──────────────────────────────────────────────────────────────

  const editCodeId = request.mode === "edit" ? request.codeId : null;
  const editHint = request.mode === "edit" ? request.code : undefined;
  useEffect(() => {
    if (!editCodeId) return;
    let cancelled = false;
    loadCodeForEdit(editCodeId, editHint).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      const start = fieldsFromCode(
        result.loaded.code,
        result.loaded.organization,
      );
      setLoaded(result.loaded);
      setInitial(start);
      setFields(start);
    });
    return () => {
      cancelled = true;
    };
  }, [editCodeId, editHint]);

  useEffect(() => {
    let cancelled = false;
    getCodeBuilderData()
      .then((result) => {
        if (cancelled) return;
        if (result.success) setBuilderData(result.data);
        else setBuilderError(result.error.message);
      })
      .catch(() => {
        if (!cancelled) {
          setBuilderError(
            "Couldn't reach QRdx. Check your connection and try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const code = loaded?.code ?? null;
  /** The code options and downloads act on: the edited or the created one */
  const target = code ?? created?.code ?? null;
  const kind: CodeKind = code?.kind === "page" ? "page" : "redirect";
  const isPage = kind === "page";
  const options = useCodeOptions(true, target?.id ?? null);
  const [createdTags, setCreatedTags] = useState<CodeBuilderData["tags"]>([]);
  const tags = builderData?.tags
    ? [...builderData.tags, ...(createdTags ?? [])]
    : null;
  const themes = builderData ? (builderData.themes ?? []) : null;
  const singleKeys = builderData?.keyboardShortcuts ?? true;
  const organizationKnown = !editing || loaded?.organization != null;
  const domainOptions = builderData?.domains ?? null;
  const pageTypes = usePageTypes(contentType === "page");
  const drafts = useCodeDrafts({
    userId,
    workspaceId,
    codeId: editing ? editCodeId : null,
  });
  const otherDrafts = drafts.drafts.filter((draft) => draft.id !== sessionId);

  // ─── Derived state ────────────────────────────────────────────────────────

  const ready = !editing || Boolean(code);
  const dirty = ready && !fieldsEqual(initial, fields);
  const defaultTheme =
    themes?.find((theme) => theme.isActiveDefault)?.style ?? null;
  const displayStyle: QRStyle =
    fields.style ??
    (editing ? code?.style : defaultTheme) ??
    defaultThemeState.styles;

  const destination = checkDestination(fields.destination);
  const destinationMessage =
    error?.field === "destination"
      ? error.message
      : !isPage && showDestinationError && !destination.ok
        ? destination.message
        : null;

  const typedSlug = fields.slug.trim();
  const slugChanged = Boolean(typedSlug) && typedSlug !== (code?.slug ?? "");
  const customSlugs = domainOptions?.customSlugs ?? false;
  const slugStatus = useSlugCheck({
    slug: typedSlug,
    domainId: fields.domainId,
    codeId: code?.id,
    unchanged: !slugChanged,
    enabled: customSlugs,
  });
  const domainChanged =
    Boolean(code) && fields.domainId !== (code?.domain?.id ?? null);
  const host =
    (fields.domainId &&
      domainOptions?.domains.find((item) => item.id === fields.domainId)
        ?.hostname) ||
    (fields.domainId && code?.domain?.id === fields.domainId
      ? code.domain.hostname
      : null) ||
    null;
  const slugPrefix = host
    ? `${host}/`
    : `${domainOptions?.defaultHost ?? "qrdx.dev"}/q/`;
  const link = created
    ? {
        value: created.code.shortLink,
        label: created.code.shortLink,
        isPreview: false,
      }
    : previewLink({
        current: code
          ? { shortLink: code.shortLink, slug: code.slug, domainChanged }
          : null,
        host,
        slug: customSlugs ? fields.slug : "",
        slugUsable:
          slugStatus.state === "available" || slugStatus.state === "idle",
      });

  const plans = options.plans;
  const nearCap =
    !editing &&
    usage !== null &&
    usage.limit > 0 &&
    usage.used / usage.limit >= 0.9;
  const formShown = phase === "form" && panel === null && ready;
  const submitLabel = submitKeyLabel(
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );

  const update = useCallback(
    <K extends keyof BuilderFields>(key: K, value: BuilderFields[K]) => {
      setFields((current) => ({ ...current, [key]: value }));
      setError((current) =>
        current &&
        ((key === "destination" && current.field === "destination") ||
          (key === "slug" && current.field === "slug") ||
          (key === "domainId" && current.field === "domain"))
          ? null
          : current,
      );
    },
    [],
  );
  const onStyleChange = useCallback(
    (style: QRStyle) => setFields((current) => ({ ...current, style })),
    [],
  );

  // ─── Drafts ───────────────────────────────────────────────────────────────

  // Only the stable save function: depending on the hook's result object
  // (new every render) restarted the 1 s timer on every re-render.
  const saveDraft = drafts.save;
  const saveDraftNow = useCallback((): boolean => {
    const { fields: stored } = draftFieldsForStorage(fields);
    return saveDraft({
      id: sessionId,
      codeId: editing ? editCodeId : null,
      savedAt: Date.now(),
      fields: stored,
    });
  }, [saveDraft, editing, editCodeId, fields, sessionId]);

  const draftable =
    phase === "form" && dirty && hasDraftableContent(fields) && userId !== null;
  useEffect(() => {
    if (!draftable) return;
    setDraftState("saving");
    const timer = setTimeout(() => {
      setDraftState(saveDraftNow() ? "saved" : "failed");
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftable, saveDraftNow]);

  const restoreDraft = (draft: CodeDraft) => {
    setSessionId(draft.id);
    setFields({ ...draft.fields, tagIds: [...draft.fields.tagIds] });
    setError(null);
    setDraftState("saved");
    toast.success("Draft restored");
  };

  // ─── Closing ──────────────────────────────────────────────────────────────

  const finishClose = ({ keepDraft }: { keepDraft: boolean }) => {
    if (keepDraft && draftable) saveDraftNow();
    if (!keepDraft) drafts.remove(sessionId);
    setConfirm(null);
    setOpen(false);
  };

  // Unmount after the closing animation.
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(onClosed, 200);
    return () => clearTimeout(timer);
  }, [open, onClosed]);

  const requestClose = () => {
    if (isPending) return;
    if (phase === "form" && dirty) {
      setConfirm("close");
      return;
    }
    finishClose({ keepDraft: true });
  };

  const onEscape = () => {
    const action = escapeAction({
      panelOpen: panel !== null,
      dirty: phase === "form" && dirty,
      busy: isPending,
    });
    if (action === "close-panel") closePanel();
    else if (action === "confirm-close") setConfirm("close");
    else if (action === "close") finishClose({ keepDraft: true });
  };

  // ─── Saving ───────────────────────────────────────────────────────────────

  const applyResult = (
    result: SubmitResult,
    {
      optimisticKey,
      thenOpen,
    }: { optimisticKey: string; thenOpen?: CodeOptionId },
  ) => {
    if (!result.ok) {
      dropOptimistic(optimisticKey);
      setError({ ...result.error, field: result.field });
      soundEvent("error");
      if (result.field === "destination") {
        setShowDestinationError(true);
        destinationRef.current?.focus();
      }
      return;
    }
    drafts.remove(sessionId);
    setDraftState("idle");
    for (const warning of result.warnings) toast.error(warning);
    if (result.styleTrimmed) {
      toast.warning("Your logo was too large to save with the code.", {
        description: "Upload a smaller one, or add it in the full editor.",
      });
    }
    router.refresh();

    if (editing && code) {
      putOptimistic({
        key: optimisticKey,
        kind: "update",
        codeId: code.id,
        patch: {
          title: result.code.title,
          destinationUrl: result.code.destinationUrl,
          style: result.code.style,
          ...(organizationKnown && { folderId: fields.folderId }),
        },
        settledAt: Date.now(),
      });
      soundEvent("apply");
      toast.success(
        "Changes saved",
        result.code.shortLink !== code.shortLink
          ? {
              description: `Download the QR code again: it now encodes ${result.code.shortLink}.`,
            }
          : { description: "Scans now open the updated destination." },
      );
      finishClose({ keepDraft: false });
      return;
    }

    const tagsById = new Map((tags ?? []).map((tag) => [tag.id, tag]));
    putOptimistic({
      key: optimisticKey,
      kind: "create",
      code: listItemFromView(result.code, {
        folderId: fields.folderId,
        tags: fields.tagIds.flatMap((id) => {
          const tag = tagsById.get(id);
          return tag ? [{ id: tag.id, name: tag.name, color: tag.color }] : [];
        }),
      }),
      settledAt: Date.now(),
    });
    setCreated({ code: result.code, copied: false, warnings: result.warnings });
    setPhase("success");
    setPanel(thenOpen ? { type: "option", option: thenOpen } : null);
    soundEvent("success");
    track("dynamic_code_created", { source: "dashboard" });
    // Copied right away, like Dub; the success screen keeps a Copy button.
    navigator.clipboard
      ?.writeText(result.code.shortLink)
      .then(() =>
        setCreated((current) => current && { ...current, copied: true }),
      )
      .catch(() => {
        // Clipboard blocked: the Copy button is right there.
      });
  };

  const submit = ({
    thenOpen,
    confirmed,
  }: {
    thenOpen?: CodeOptionId;
    confirmed?: boolean;
  } = {}) => {
    if (isPending || phase !== "form" || !ready) return;
    if (!(isPage && editing)) {
      setShowDestinationError(true);
      if (!destination.ok) {
        soundEvent("error");
        destinationRef.current?.focus();
        return;
      }
    }
    if (slugChanged && slugStatus.state === "blocked") {
      setError({
        code: "INVALID_SLUG",
        message: slugStatus.message,
        field: "slug",
      });
      return;
    }
    if (editing && !dirty) return;
    // A heuristic, so it asks instead of blocking.
    if (score?.grade === "fails" && !confirmed) {
      setConfirm({ lowScore: thenOpen ?? null });
      return;
    }

    setError(null);
    const optimisticKey = newDraftId();
    startTransition(async () => {
      if (editing && code) {
        putOptimistic({
          key: optimisticKey,
          kind: "update",
          codeId: code.id,
          patch: {
            title: fields.title.trim() || null,
            ...(!isPage &&
              destination.ok && { destinationUrl: destination.url }),
            ...(fields.style && { style: fields.style }),
            ...(organizationKnown && { folderId: fields.folderId }),
          },
          settledAt: null,
        });
        const result = await submitUpdate(
          code,
          initial,
          fields,
          builderServices,
          { organizationKnown },
        );
        applyResult(result, { optimisticKey });
        return;
      }
      const result = await submitCreate(fields, builderServices);
      applyResult(result, { optimisticKey, thenOpen });
    });
  };

  // ─── Options ──────────────────────────────────────────────────────────────

  const selectOption = (id: CodeOptionId) => {
    const access = plans?.options[id];
    if (!access || isPending) return;
    // An option off the plan only explains which plan unlocks it.
    if (target || !access.included) {
      setPanel({ type: "option", option: id });
      return;
    }
    // Round 4's flow: an option on a new code creates the code first.
    submit({ thenOpen: id });
  };

  function closePanel() {
    if (panel?.type === "option") options.reload();
    setPanel(null);
  }

  const startAnother = () => {
    setLoaded(null);
    setCreated(null);
    setInitial(EMPTY_FIELDS);
    setFields(EMPTY_FIELDS);
    setPanel(null);
    setError(null);
    setScore(null);
    setShowDestinationError(false);
    setSessionId(newDraftId());
    setDraftState("idle");
    setPhase("form");
  };

  const openFullEditor = () => {
    const style = displayStyle;
    if (target && userId) {
      openInFullEditor({ code: target, style, userId });
    } else if (destination.ok) {
      openInFullEditor({ code: null, destination: destination.url, style });
    } else {
      return;
    }
    finishClose({ keepDraft: true });
    router.push("/playground");
  };

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  const keyActions = useRef({ submit, selectOption });
  keyActions.current = { submit, selectOption };
  const shortcutContext = {
    singleKeys,
    options: isPage ? codeOptionsFor("page") : codeOptionsFor("redirect"),
    busy: isPending,
    formShown: formShown && contentType === "link",
  };
  const contextRef = useRef(shortcutContext);
  contextRef.current = shortcutContext;
  const confirmOpen = confirm !== null;

  useEffect(() => {
    if (!open || confirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const content = contentRef.current;
      const element = event.target instanceof HTMLElement ? event.target : null;
      // Only keys meant for the builder: not a menu or popover above it.
      if (
        !content ||
        !(element === document.body || (element && content.contains(element)))
      ) {
        return;
      }
      const action = resolveBuilderShortcut(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          target: element
            ? {
                tagName: element.tagName,
                isContentEditable: element.isContentEditable,
                role: element.getAttribute("role"),
              }
            : null,
        },
        contextRef.current,
      );
      if (!action) return;
      event.preventDefault();
      if (action.type === "submit") keyActions.current.submit();
      else keyActions.current.selectOption(action.option);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, confirmOpen]);

  // ─── Pieces ───────────────────────────────────────────────────────────────

  const title =
    phase === "success"
      ? "Your dynamic QR code is ready"
      : editing
        ? "Edit dynamic QR code"
        : "New dynamic QR code";
  const optionPanel = panel?.type === "option" ? panel.option : null;

  const formBanner =
    error?.field === "form" || error?.field === "domain" ? (
      <div
        className="bg-destructive/10 text-destructive space-y-2 rounded-md p-3 text-sm"
        role="alert"
      >
        <p>{error.message}</p>
        {needsUpgrade(error.code) && (
          <Button
            onClick={() =>
              error.code === "LIMIT_REACHED" && plans?.upgrades.unlimitedCodes
                ? plans.upgrades.unlimitedCodes === "business"
                  ? openUpgradeDialog("business")
                  : openGetProDialog()
                : openGetProDialog()
            }
            size="sm"
            type="button"
          >
            {error.code === "LIMIT_REACHED" && plans?.upgrades.unlimitedCodes
              ? `Upgrade to ${PLAN_NAMES[plans.upgrades.unlimitedCodes]}`
              : "Upgrade"}
          </Button>
        )}
      </div>
    ) : null;

  const designButton = phase === "form" && panel === null && (
    <Button
      onClick={() => setPanel({ type: "style" })}
      size="sm"
      type="button"
      variant="outline"
    >
      <Brush2 aria-hidden />
      Design
    </Button>
  );

  const preview = (
    <BuilderPreview
      action={wide ? undefined : designButton}
      compact={!wide}
      isPreview={link.isPreview}
      link={link.label}
      onScore={setScore}
      style={created ? (created.code.style ?? displayStyle) : displayStyle}
      value={link.value}
    />
  );

  const fullEditorButton = (
    <Button
      className="w-full"
      disabled={!(target || destination.ok)}
      onClick={openFullEditor}
      size="sm"
      title={
        target || destination.ok
          ? "Art, AI art, padding and more in the playground"
          : "Enter a destination first"
      }
      type="button"
      variant="outline"
    >
      <Brush2 aria-hidden />
      Open full editor
    </Button>
  );

  const linkForm = (
    <>
      {isPage && code ? (
        <div className="rounded-lg border p-3 text-sm">
          <p className="text-muted-foreground">
            This code opens a hosted page.
          </p>
          {code.pageId && (
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
            <Label htmlFor="code-builder-destination">Destination URL</Label>
            <InfoHint align="start" id="dynamic-destination" />
          </div>
          <Input
            aria-describedby={
              destinationMessage ? "code-builder-destination-error" : undefined
            }
            aria-invalid={destinationMessage ? true : undefined}
            autoFocus={wide && !editing}
            id="code-builder-destination"
            inputMode="url"
            maxLength={2048}
            onBlur={() => {
              if (fields.destination.trim()) setShowDestinationError(true);
            }}
            onChange={(event) => update("destination", event.target.value)}
            placeholder="https://example.com/menu"
            ref={destinationRef}
            value={fields.destination}
          />
          {destinationMessage ? (
            <p
              className="text-destructive text-xs"
              id="code-builder-destination-error"
            >
              {destinationMessage}
            </p>
          ) : null}
          <AccountSourcePicker
            contentType="url"
            onPick={(item) => update("destination", item.url)}
          />
        </div>
      )}

      <DomainPicker
        current={code?.domain ?? null}
        disabled={isPending}
        onChange={(domainId) => update("domainId", domainId)}
        options={domainOptions}
        value={fields.domainId}
      />
      {domainOptions ? (
        <div className="space-y-1">
          <SlugField
            allowed={customSlugs}
            disabled={isPending}
            editing={editing}
            onChange={(slug) => update("slug", slug)}
            onUpgrade={openGetProDialog}
            prefix={slugPrefix}
            status={
              error?.field === "slug"
                ? { state: "blocked", message: error.message }
                : slugStatus
            }
            value={fields.slug}
          />
        </div>
      ) : builderData || builderError ? (
        // Loaded without domain options: the server still generates a link.
        <p className="text-muted-foreground text-xs">
          {editing
            ? "The short link stays as it is."
            : "The short link is generated when you create the code."}
        </p>
      ) : (
        <Skeleton className="h-[4.5rem] w-full" />
      )}
      {domainChanged && !slugChanged && code && (
        <p
          className={
            code.domain?.verified || !code.defaultShortLink
              ? "bg-destructive/10 text-destructive rounded-md p-3 text-sm"
              : "bg-muted rounded-md p-3 text-sm"
          }
        >
          {code.domain?.verified
            ? code.defaultShortLink
              ? `QR codes already printed with ${code.shortLink} will stop working. Codes printed with ${code.defaultShortLink} keep working.`
              : `QR codes already printed with ${code.shortLink} will stop working. Its back-half moves with the code when it's free there, otherwise the code gets a new one.`
            : "The QR code changes to the new link, so download it again after saving. Codes you already printed keep working."}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="code-builder-title">
          Title{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="code-builder-title"
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => update("title", event.target.value)}
          placeholder="Table tent, spring menu"
          value={fields.title}
        />
      </div>

      {organizationKnown ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FolderField
            disabled={isPending}
            folders={builderData ? (builderData.folders ?? []) : null}
            onChange={(folderId) => update("folderId", folderId)}
            value={fields.folderId}
          />
          <TagsField
            disabled={isPending}
            onChange={(tagIds) => update("tagIds", tagIds)}
            onCreated={(tag) =>
              setCreatedTags((list) => [...(list ?? []), tag])
            }
            tags={tags}
            value={fields.tagIds}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Change this code's folder and tags from the codes list.
        </p>
      )}
      {(builderError || (builderData?.problems.length ?? 0) > 0) && (
        <p className="text-muted-foreground text-xs" role="status">
          {builderError ?? builderData?.problems.join(" ")}
        </p>
      )}

      <BuilderOptionsOn kind={kind} onSelect={selectOption} options={options} />
      {formBanner}
    </>
  );

  const pageTypePicker = (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Pick a page type. You choose its template next.
      </p>
      {pageTypes ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {pageTypes.listTemplates().map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="hover:bg-muted/60 focus-visible:ring-ring/50 flex items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-[3px]"
                key={item.type}
                onClick={() => {
                  setOpen(false);
                  onChoosePageType(item.type);
                }}
                type="button"
              >
                <span className="bg-muted/40 text-foreground/80 flex size-9 shrink-0 items-center justify-center rounded-md border">
                  <Icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="text-muted-foreground block text-xs leading-snug">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-[66px] rounded-lg" key={index} />
          ))}
        </div>
      )}
    </div>
  );

  const successBody = created && (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>Short link</Label>
        <div className="flex items-center gap-1">
          <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm">
            {created.code.shortLink}
          </code>
          <CopyButton
            className="size-8"
            successMessage={{ title: "Short link copied" }}
            textToCopy={created.code.shortLink}
          />
        </div>
        {created.copied && (
          <p className="text-muted-foreground text-xs">
            Copied to your clipboard.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Opens</Label>
        <p className="text-muted-foreground text-sm break-all">
          {created.code.destinationUrl}
        </p>
      </div>
      {!wide && <CodeDownloadButtons code={created.code} />}
      <BuilderOptionsOn
        kind="redirect"
        onSelect={selectOption}
        options={options}
      />
      {created.warnings.length > 0 && (
        <ul className="bg-muted space-y-1 rounded-md p-3 text-sm">
          {created.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link
            href={codeTabHref(created.code.id, "overview")}
            onClick={() => finishClose({ keepDraft: false })}
          >
            <ExportSquare aria-hidden />
            Open the code
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link
            href={codeTabHref(created.code.id, "analytics")}
            onClick={() => finishClose({ keepDraft: false })}
          >
            View analytics
          </Link>
        </Button>
      </div>
    </div>
  );

  const optionBody = optionPanel && (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          className="-ml-2"
          onClick={closePanel}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden />
          Back
        </Button>
        <span className="text-sm font-medium">
          {CODE_OPTION_COPY[optionPanel].label}
        </span>
      </div>
      {plans && (
        <p className="text-muted-foreground text-sm">
          <CodeOptionPlanNote option={optionPanel} plans={plans} />
        </p>
      )}
      {options.ready && plans ? (
        <CodeOptionPanel
          lifecycle={options.data?.lifecycle ?? null}
          marketing={options.marketing}
          option={optionPanel}
          plans={plans}
        />
      ) : options.error ? (
        <p className="text-destructive text-sm" role="alert">
          {options.error}
        </p>
      ) : (
        <PanelFallback />
      )}
    </div>
  );

  const styleBody = (
    <BuilderStyle
      onChange={onStyleChange}
      style={displayStyle}
      themes={themes}
      value={link.value}
    />
  );

  let main: React.ReactNode;
  if (loadError) {
    main = (
      <p className="text-destructive text-sm" role="alert">
        {loadError}
      </p>
    );
  } else if (!ready) {
    main = (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  } else if (optionBody) {
    main = optionBody;
  } else if (panel?.type === "style") {
    main = (
      <div className="space-y-3">
        <Button
          className="-ml-2"
          onClick={closePanel}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden />
          Back
        </Button>
        <div className="-mx-4 border-y">{styleBody}</div>
        {fullEditorButton}
      </div>
    );
  } else if (phase === "success") {
    main = successBody;
  } else {
    main = (
      <form
        className="space-y-5"
        id="code-builder-form"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (contentType === "link") submit();
        }}
      >
        {!editing && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">What does it open?</p>
            <ToggleGroup
              className="w-full"
              onValueChange={(value) => {
                if (value === "link" || value === "page") setContentType(value);
              }}
              type="single"
              value={contentType}
              variant="outline"
            >
              <ToggleGroupItem className="flex-1 gap-1.5" value="link">
                <Link2 aria-hidden className="size-4" />
                Website link
              </ToggleGroupItem>
              <ToggleGroupItem className="flex-1 gap-1.5" value="page">
                <DocumentText1 aria-hidden className="size-4" />
                Hosted page
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
        {contentType === "page" && !editing ? pageTypePicker : linkForm}
      </form>
    );
  }

  const showPreviewColumn = wide && !(contentType === "page" && !editing);
  const showOptions = ready && !(contentType === "page" && !editing);

  return (
    <>
      <ResponsiveDialog
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        open={open}
      >
        <ResponsiveDialogContent
          className="flex flex-col gap-0 overflow-hidden p-0 max-sm:max-h-[92svh] sm:max-w-5xl"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onEscape();
          }}
          ref={contentRef}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <ResponsiveDialogTitle className="truncate text-base">
                {optionPanel
                  ? `${title} · ${CODE_OPTION_COPY[optionPanel].label}`
                  : title}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="truncate text-xs max-sm:sr-only">
                {phase === "success"
                  ? "Download it and print it anywhere. You can change where it points at any time."
                  : code
                    ? displayUrl(code.shortLink)
                    : "It encodes a short link, so you can change where it points after printing."}
              </ResponsiveDialogDescription>
            </div>
            {phase === "form" && (
              <DraftControls
                drafts={otherDrafts}
                onDelete={(draft) => drafts.remove(draft.id)}
                onRestore={restoreDraft}
                state={draftState}
              />
            )}
            <Button
              aria-label="Close"
              className="size-8 shrink-0"
              onClick={requestClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Close className="size-4" />
            </Button>
          </div>

          {/* Body */}
          <div
            className={cn(
              "grid min-h-0 flex-1",
              showPreviewColumn &&
                "md:h-[min(38rem,calc(100dvh-12rem))] md:grid-cols-[minmax(0,1fr)_21rem]",
            )}
          >
            <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
              {!wide && ready && !(contentType === "page" && !editing) && (
                <div className="mb-4">{preview}</div>
              )}
              {main}
            </div>
            {showPreviewColumn && (
              <div className="bg-muted/20 flex min-h-0 flex-col border-l">
                <div className="shrink-0 p-4">{ready && preview}</div>
                {phase === "success" && created ? (
                  <div className="space-y-2 px-4 pb-4">
                    <CodeDownloadButtons code={created.code} />
                    {fullEditorButton}
                  </div>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto border-t">
                      {ready && styleBody}
                    </div>
                    <div className="shrink-0 border-t p-3">
                      {fullEditorButton}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer (none while picking a page type: that continues in the gallery) */}
          <div
            className={cn(
              "bg-muted/30 flex flex-col gap-3 border-t px-4 py-3 sm:px-5 md:flex-row md:items-center",
              contentType === "page" &&
                !editing &&
                phase === "form" &&
                "hidden",
            )}
          >
            <div className="min-w-0 flex-1">
              {showOptions && (
                <BuilderOptionBar
                  active={optionPanel}
                  disabled={isPending}
                  kind={kind}
                  onSelect={selectOption}
                  options={options}
                  showKeys={singleKeys}
                />
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              {nearCap && phase === "form" && usage && plans && (
                <span className="text-muted-foreground mr-1 text-xs">
                  {usage.used} of {usage.limit} active codes on{" "}
                  {PLAN_NAMES[plans.plan]}
                </span>
              )}
              {phase === "success" ? (
                <>
                  <Button
                    onClick={startAnother}
                    type="button"
                    variant="outline"
                  >
                    Create another
                  </Button>
                  <Button
                    onClick={() => finishClose({ keepDraft: false })}
                    type="button"
                  >
                    Done
                  </Button>
                </>
              ) : contentType === "page" && !editing ? null : (
                <Button
                  aria-keyshortcuts="Meta+Enter Control+Enter"
                  aria-label={editing ? "Save changes" : "Create code"}
                  className="max-md:w-full"
                  disabled={
                    isPending || !ready || panel !== null || (editing && !dirty)
                  }
                  form="code-builder-form"
                  type="submit"
                >
                  {isPending
                    ? editing
                      ? "Saving..."
                      : "Creating..."
                    : editing
                      ? "Save changes"
                      : "Create code"}
                  {!isPending && (
                    <Kbd
                      aria-hidden
                      className="bg-primary-foreground/15 text-primary-foreground ml-1 hidden md:inline-flex"
                    >
                      {submitLabel}
                    </Kbd>
                  )}
                </Button>
              )}
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <AlertDialog
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
        open={confirm === "close"}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              {draftState === "failed" || !userId
                ? "This browser can't keep a draft, so your changes will be lost."
                : "Your changes stay in Drafts in this browser for 7 days."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              onClick={() => finishClose({ keepDraft: false })}
              type="button"
              variant="outline"
            >
              Discard draft
            </Button>
            {draftState !== "failed" && userId && (
              <AlertDialogAction
                onClick={() => finishClose({ keepDraft: true })}
              >
                Keep draft
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
        open={typeof confirm === "object" && confirm !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This design may not scan</AlertDialogTitle>
            <AlertDialogDescription>
              The scan check couldn't read it at every size. Change the design,
              or {editing ? "save" : "create"} it anyway and test-scan it before
              you print.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Change the design</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const thenOpen =
                  typeof confirm === "object" && confirm
                    ? (confirm.lowScore ?? undefined)
                    : undefined;
                setConfirm(null);
                submit({ thenOpen, confirmed: true });
              }}
            >
              {editing ? "Save anyway" : "Create anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
