"use client";

import { toast } from "@repo/design-system";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { cn } from "@repo/design-system/lib/utils";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  QrCode,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { publishLandingPage } from "@/actions/landing-pages";
import { PhoneFrame } from "@/components/mockups/phone-frame";
import {
  type BlockEditorContext,
  createBlock,
  getBlock,
  parseLandingPageContent,
} from "@/lib/landing/blocks";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { LandingBlock, LandingPageContent } from "@/types/landing";
import { scopeCustomCss } from "../custom-css";
import { LandingPageFooter } from "../page-footer";
import {
  DEFAULT_PAGE_SETTINGS,
  PAGE_SETTINGS_TYPE,
  type PageSettings,
} from "../page-settings-block";
import { LandingRender } from "../render";
import { AddBlockMenu } from "./add-block-menu";
import { BrandingSection } from "./branding-section";
import { PageSettingsEditor } from "./page-settings-editor";
import { type SavedThemePalette, ThemeControls } from "./theme-controls";

export interface PageEditorProps {
  page: {
    id: string;
    title: string | null;
    version: number;
    typeLabel: string;
  };
  initialContent: LandingPageContent;
  /** The page's first QR code, null when none is linked */
  code: { id: string; pageUrl: string; shortLink: string } | null;
  savedThemes: SavedThemePalette[];
  canUseCustomCss: boolean;
  /** badge: "Made with QRdx" footer (Free); whiteLabel: Business */
  branding: { badge: boolean; whiteLabel: boolean };
  storageEnabled: boolean;
}

type Issues = Map<string, string[]>;

const snapshot = (title: string, content: LandingPageContent) =>
  JSON.stringify({ title: title.trim(), content });

const draftKey = (id: string) => `qrdx:page-draft:${id}`;

interface Draft {
  version: number;
  title: string;
  content: LandingPageContent;
  savedAt: number;
}

function readDraft(id: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(id), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    // Storage full or blocked: drafts are a convenience only.
  }
}

/** Validation issues keyed by block id ("theme" for theme issues). */
function collectIssues(content: LandingPageContent): Issues {
  const issues: Issues = new Map();
  const result = parseLandingPageContent(content);
  if (result.success) return issues;
  for (const issue of result.error.issues) {
    const [root, index] = issue.path;
    const key =
      root === "blocks" && typeof index === "number"
        ? (content.blocks[index]?.id ?? "page")
        : root === "theme"
          ? "theme"
          : "page";
    issues.set(key, [...(issues.get(key) ?? []), issue.message]);
  }
  return issues;
}

function blockSummary(block: LandingBlock): string {
  const props = block.props as Record<string, unknown>;
  for (const key of [
    "title",
    "label",
    "heading",
    "firstName",
    "name",
    "body",
  ]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const items = props.items;
  if (Array.isArray(items))
    return `${items.length} item${items.length === 1 ? "" : "s"}`;
  return "";
}

export function PageEditor({
  page,
  initialContent,
  code,
  savedThemes,
  canUseCustomCss,
  branding,
  storageEnabled,
}: PageEditorProps) {
  const router = useRouter();
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(page.title ?? "");
  const [version, setVersion] = useState(page.version);
  const [published, setPublished] = useState(() =>
    snapshot(page.title ?? "", initialContent),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("blocks");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isPublishing, startPublishing] = useTransition();
  const dragId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dirty = snapshot(title, content) !== published;
  const issues = useMemo(() => collectIssues(content), [content]);
  const issueCount = [...issues.values()].reduce(
    (n, list) => n + list.length,
    0,
  );

  // Offer to restore unpublished edits from this browser.
  useEffect(() => {
    const saved = readDraft(page.id);
    if (
      saved &&
      saved.version === page.version &&
      snapshot(saved.title, saved.content) !==
        snapshot(page.title ?? "", initialContent)
    ) {
      setDraft(saved);
    } else if (saved) {
      writeDraft(page.id, null);
    }
  }, [page.id, page.version, page.title, initialContent]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(
      () =>
        writeDraft(page.id, { version, title, content, savedAt: Date.now() }),
      800,
    );
    return () => clearTimeout(timer);
  }, [dirty, page.id, version, title, content]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const editableBlocks = content.blocks.filter(
    (block) => block.type !== PAGE_SETTINGS_TYPE,
  );
  const settingsBlock = content.blocks.find(
    (block) => block.type === PAGE_SETTINGS_TYPE,
  );
  const settings =
    (settingsBlock?.props as PageSettings | undefined) ?? DEFAULT_PAGE_SETTINGS;

  const setBlocks = (update: (blocks: LandingBlock[]) => LandingBlock[]) =>
    setContent((current) => ({ ...current, blocks: update(current.blocks) }));

  const updateBlock = (id: string, patch: Partial<LandingBlock>) =>
    setBlocks((blocks) =>
      blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );

  const addBlock = (type: string) => {
    const block = createBlock(type);
    setBlocks((blocks) => {
      const index = selected
        ? blocks.findIndex((current) => current.id === selected)
        : -1;
      const next = [...blocks];
      next.splice(index === -1 ? next.length : index + 1, 0, block);
      return next;
    });
    setSelected(block.id);
    setTab("blocks");
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-editor-block="${block.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  const removeBlock = (id: string) => {
    const before = content.blocks;
    setBlocks((blocks) => blocks.filter((block) => block.id !== id));
    if (selected === id) setSelected(null);
    toast("Block removed", {
      action: { label: "Undo", onClick: () => setBlocks(() => before) },
    });
  };

  const duplicateBlock = (id: string) => {
    const source = content.blocks.find((block) => block.id === id);
    if (!source) return;
    const copy = { ...structuredClone(source), id: crypto.randomUUID() };
    setBlocks((blocks) => {
      const next = [...blocks];
      next.splice(next.findIndex((block) => block.id === id) + 1, 0, copy);
      return next;
    });
    setSelected(copy.id);
  };

  /** Moves within the visible list (page settings stay where they are). */
  const moveBlock = (id: string, toVisibleIndex: number) => {
    setBlocks((blocks) => {
      const visible = blocks.filter(
        (block) => block.type !== PAGE_SETTINGS_TYPE,
      );
      const from = visible.findIndex((block) => block.id === id);
      if (
        from === -1 ||
        toVisibleIndex < 0 ||
        toVisibleIndex >= visible.length
      ) {
        return blocks;
      }
      const [moved] = visible.splice(from, 1);
      if (moved) visible.splice(toVisibleIndex, 0, moved);
      return [
        ...visible,
        ...blocks.filter((block) => block.type === PAGE_SETTINGS_TYPE),
      ];
    });
  };

  const setSettings = (next: PageSettings) => {
    setBlocks((blocks) =>
      blocks.some((block) => block.type === PAGE_SETTINGS_TYPE)
        ? blocks.map((block) =>
            block.type === PAGE_SETTINGS_TYPE
              ? { ...block, props: next }
              : block,
          )
        : [...blocks, { ...createBlock(PAGE_SETTINGS_TYPE), props: next }],
    );
  };

  const publish = useCallback(() => {
    if (issueCount > 0) {
      toast.error(
        `Fix ${issueCount} ${issueCount === 1 ? "issue" : "issues"} before publishing`,
      );
      return;
    }
    startPublishing(async () => {
      const result = await publishLandingPage({
        id: page.id,
        title,
        content,
        baseVersion: version,
      });
      if (!result.success) {
        if (result.error.code === "CONFLICT") setConflict(true);
        if (result.error.code === "PLAN_REQUIRED") {
          openUpgradeDialog("business");
        }
        toast.error(result.error.message);
        return;
      }
      setVersion(result.data.version);
      setPublished(snapshot(title, content));
      writeDraft(page.id, null);
      setDraft(null);
      toast.success("Published", {
        description: code
          ? "Scans now open the updated page."
          : "Create a QR code for this page to share it.",
      });
      router.refresh();
    });
  }, [
    issueCount,
    page.id,
    title,
    content,
    version,
    code,
    router,
    openUpgradeDialog,
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !isPublishing) publish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, isPublishing, publish]);

  const editorContext: BlockEditorContext = {
    theme: content.theme,
    pageId: page.id,
    storageEnabled,
  };

  const css = useMemo(() => {
    if (!(canUseCustomCss && settings.customCss.trim())) return null;
    const result = scopeCustomCss(settings.customCss);
    return result.ok ? result.css : null;
  }, [canUseCustomCss, settings.customCss]);

  const onDrop = (event: DragEvent, targetIndex: number) => {
    event.preventDefault();
    const id = dragId.current;
    dragId.current = null;
    if (id) moveBlock(id, targetIndex);
  };

  const preview = (
    // Links don't navigate in the preview; tapping a block selects it.
    <div
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button[type='submit'], form")) {
          event.preventDefault();
        }
        const blockId = target
          .closest<HTMLElement>("[data-block-id]")
          ?.getAttribute("data-block-id");
        if (blockId) {
          setSelected(blockId);
          setTab("blocks");
        }
      }}
    >
      {selected && /^[A-Za-z0-9_-]+$/.test(selected) && (
        <style>{`[data-block-id="${selected}"]{outline:2px dashed color-mix(in srgb, currentColor 45%, transparent);outline-offset:6px;border-radius:4px}`}</style>
      )}
      <LandingRender
        content={content}
        context={{
          theme: content.theme,
          mode: "preview",
          pageId: page.id,
          qrCodeId: code?.id ?? null,
        }}
        customCss={css}
        fill="container"
        footer={
          <LandingPageFooter
            badge={branding.badge}
            badgeHref="#"
            reportHref="#"
          />
        }
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button asChild size="icon" title="All pages" variant="ghost">
            <Link aria-label="All pages" href="/dashboard/pages">
              <ArrowLeft />
            </Link>
          </Button>
          <Input
            aria-label="Page title"
            className="h-9 max-w-sm text-base font-semibold"
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={`Untitled ${page.typeLabel.toLowerCase()}`}
            value={title}
          />
          <Badge className="hidden sm:inline-flex" variant="secondary">
            {page.typeLabel}
          </Badge>
          <span
            aria-live="polite"
            className="text-muted-foreground hidden text-xs whitespace-nowrap sm:inline"
          >
            {dirty ? "Unpublished changes" : `Published · v${version}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {code ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/codes/${encodeURIComponent(code.id)}`}>
                  <QrCode />
                  QR code
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={code.pageUrl} rel="noopener" target="_blank">
                  <ExternalLink />
                  View live
                </a>
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">
              No QR code links to this page yet
            </span>
          )}
          <Button
            disabled={!dirty || isPublishing}
            onClick={publish}
            size="sm"
            title="Publish (⌘S)"
          >
            {isPublishing && <Loader2 className="animate-spin" />}
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      {draft && (
        <div className="bg-muted flex flex-col gap-2 rounded-md p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>
            You have unpublished changes from{" "}
            {new Date(draft.savedAt).toLocaleString()} in this browser.
          </span>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setContent(draft.content);
                setTitle(draft.title);
                setDraft(null);
              }}
              size="sm"
            >
              Restore
            </Button>
            <Button
              onClick={() => {
                writeDraft(page.id, null);
                setDraft(null);
              }}
              size="sm"
              variant="ghost"
            >
              Discard
            </Button>
          </div>
        </div>
      )}
      {conflict && (
        <div
          className="bg-destructive/10 text-destructive flex flex-col gap-2 rounded-md p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>
            This page was published from somewhere else. Reload to continue from
            the latest version.
          </span>
          <Button
            onClick={() => {
              writeDraft(page.id, null);
              window.location.reload();
            }}
            size="sm"
            variant="outline"
          >
            Reload
          </Button>
        </div>
      )}

      <div className="flex gap-1 lg:hidden">
        {(["edit", "preview"] as const).map((value) => (
          <Button
            aria-pressed={view === value}
            key={value}
            onClick={() => setView(value)}
            size="sm"
            variant={view === value ? "secondary" : "ghost"}
          >
            {value === "edit" ? "Edit" : "Preview"}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cn("min-w-0", view === "preview" && "hidden lg:block")}>
          <Tabs onValueChange={setTab} value={tab}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="blocks">
                Blocks
                {issues.size > 0 &&
                  [...issues.keys()].some((key) => key !== "theme") && (
                    <AlertCircle className="text-destructive size-3.5" />
                  )}
              </TabsTrigger>
              <TabsTrigger value="design">
                Design
                {issues.has("theme") && (
                  <AlertCircle className="text-destructive size-3.5" />
                )}
              </TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4 space-y-3" value="blocks">
              <div className="space-y-2" ref={listRef}>
                {editableBlocks.length === 0 && (
                  <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                    This page is empty. Add your first block.
                  </p>
                )}
                {editableBlocks.map((block, index) => {
                  const definition = getBlock(block.type);
                  const open = selected === block.id;
                  const blockIssues = issues.get(block.id);
                  const Icon = definition?.icon;
                  const Editor = definition?.Editor;
                  const summary = blockSummary(block);
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for drag reordering; the move buttons are the keyboard alternative
                    <div
                      className={cn(
                        "bg-card rounded-lg border transition-shadow",
                        open && "ring-ring/40 ring-2",
                        blockIssues && "border-destructive/60",
                        block.hidden && "opacity-60",
                      )}
                      data-editor-block={block.id}
                      key={block.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onDrop(event, index)}
                    >
                      <div className="flex items-center gap-1 p-1.5">
                        <span
                          aria-hidden="true"
                          className="text-muted-foreground hidden cursor-grab p-1 active:cursor-grabbing sm:block"
                          draggable
                          onDragEnd={() => {
                            dragId.current = null;
                          }}
                          onDragStart={(event) => {
                            dragId.current = block.id;
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          title="Drag to reorder"
                        >
                          <GripVertical className="size-4" />
                        </span>
                        <button
                          aria-expanded={open}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted"
                          onClick={() => setSelected(open ? null : block.id)}
                          type="button"
                        >
                          {Icon && <Icon className="size-4 shrink-0" />}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {definition?.label ?? block.type}
                            </span>
                            {summary && (
                              <span className="text-muted-foreground block truncate text-xs">
                                {summary}
                              </span>
                            )}
                          </span>
                          {blockIssues && (
                            <AlertCircle className="text-destructive size-4 shrink-0" />
                          )}
                          <ChevronDown
                            className={cn(
                              "text-muted-foreground size-4 shrink-0 transition-transform",
                              open && "rotate-180",
                            )}
                          />
                        </button>
                        <Button
                          aria-label="Move up"
                          className="size-8"
                          disabled={index === 0}
                          onClick={() => moveBlock(block.id, index - 1)}
                          size="icon"
                          variant="ghost"
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          aria-label="Move down"
                          className="size-8"
                          disabled={index === editableBlocks.length - 1}
                          onClick={() => moveBlock(block.id, index + 1)}
                          size="icon"
                          variant="ghost"
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          aria-label={
                            block.hidden ? "Show block" : "Hide block"
                          }
                          className="size-8"
                          onClick={() =>
                            updateBlock(block.id, {
                              hidden: block.hidden ? undefined : true,
                            })
                          }
                          size="icon"
                          title={block.hidden ? "Hidden on the page" : "Hide"}
                          variant="ghost"
                        >
                          {block.hidden ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button
                          aria-label="Duplicate block"
                          className="hidden size-8 sm:inline-flex"
                          onClick={() => duplicateBlock(block.id)}
                          size="icon"
                          variant="ghost"
                        >
                          <Copy />
                        </Button>
                        <Button
                          aria-label="Remove block"
                          className="size-8"
                          onClick={() => removeBlock(block.id)}
                          size="icon"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      {open && (
                        <div className="space-y-3 border-t p-4">
                          {blockIssues && (
                            <ul
                              className="bg-destructive/10 text-destructive list-inside list-disc rounded-md p-2 text-xs"
                              role="alert"
                            >
                              {[...new Set(blockIssues)].map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          )}
                          {Editor ? (
                            <Editor
                              context={editorContext}
                              id={block.id}
                              onChange={(props: Record<string, unknown>) =>
                                updateBlock(block.id, { props })
                              }
                              value={block.props}
                            />
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              This block type is no longer available. Remove it
                              to publish.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <AddBlockMenu
                disabled={content.blocks.length >= 100}
                onAdd={addBlock}
              />
            </TabsContent>

            <TabsContent className="mt-4" value="design">
              {issues.get("theme") && (
                <ul
                  className="bg-destructive/10 text-destructive mb-4 list-inside list-disc rounded-md p-2 text-xs"
                  role="alert"
                >
                  {[...new Set(issues.get("theme"))].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              <ThemeControls
                onChange={(theme) =>
                  setContent((current) => ({ ...current, theme }))
                }
                savedThemes={savedThemes}
                theme={content.theme}
              />
            </TabsContent>

            <TabsContent className="mt-4 space-y-3" value="settings">
              {settingsBlock && issues.get(settingsBlock.id) && (
                <ul
                  className="bg-destructive/10 text-destructive list-inside list-disc rounded-md p-2 text-xs"
                  role="alert"
                >
                  {[...new Set(issues.get(settingsBlock.id))].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              <PageSettingsEditor
                context={editorContext}
                customCssAllowed={canUseCustomCss}
                id={settingsBlock?.id ?? "page-settings"}
                onChange={setSettings}
                value={settings}
              />
              <BrandingSection
                badge={branding.badge}
                whiteLabel={branding.whiteLabel}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className={cn(view === "edit" && "hidden lg:block")}>
          <div className="sticky top-6 space-y-2">
            <PhoneFrame className="mx-auto w-full max-w-[340px]">
              {preview}
            </PhoneFrame>
            <p className="text-muted-foreground text-center text-xs">
              Live preview · tap a block to edit it
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
