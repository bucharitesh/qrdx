"use client";

import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { EYE_POSITIONS, getSolidColor, LOGO_SIZE_MIN } from "qrdx/types";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { defaultThemeState } from "@/config/qr";
import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcuts";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import type { DesignSection } from "@/lib/playground-links";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import { usePlaygroundFocusStore } from "@/store/playground-focus-store";
import type { ThemeEditorState } from "@/types/editor";
import type { QRStyle } from "@/types/theme";
import { frameShapeOf } from "../control-sections/frame-shapes";
import {
  logoOptionsChange,
  useLogoSize,
} from "../control-sections/logo-options-section";
import { logoIconId, quickIconDataUrl } from "../control-sections/logo-presets";
import { MAX_PADDING } from "../control-sections/padding-controls";
import { InsideSidePanel } from "../control-sections/side-panel";
import { PREVIEW_CODE_SELECTOR } from "../frame-inline/frame-text-overlay";
import { insideInlineEditor } from "../frame-inline/inline-toolbar";
import { type Box, previewFrameSvg } from "../frame-inline/preview-labels";
import { QRStyleScopeProvider } from "../style-scope";
import {
  type ContentSnapshot,
  contentSnapshot,
  restoreContent,
} from "./content-field";
import { LogoDrop } from "./logo-drop";
import { measureParts, partsKey } from "./part-boxes";
import {
  type EyeScope,
  type PartItem,
  type PartItemsContext,
  usePartItems,
} from "./part-controls";
import { LogoHandles, PaddingHandle } from "./part-handles";
import { isTyping, partKeyAction } from "./part-keys";
import { PartSheet } from "./part-sheet";
import {
  anchorOf,
  type MeasuredParts,
  NO_PARTS,
  type PartId,
  type PartTarget,
  partTargets,
} from "./part-targets";
import { OUTLINE_PAD, PartToolbar } from "./part-toolbar";
import {
  randomBackground,
  randomDots,
  randomEyes,
  randomFrame,
  randomLogoIcon,
} from "./random-part";

// The code's parts in the playground preview, editable where they're drawn:
// the eyes, the dots, the logo, the background and the frame each get a
// button over them (hover shows an outline, Tab reaches them), and choosing
// one opens a small toolbar beside it (a bottom sheet on phones) with that
// part's options and a Random button. Changes show live as a draft in the
// editor store, so the preview and scan score follow; Enter, a click
// outside, Tab out or More options keep the whole edit as one undo step,
// Escape puts the code back as it was. Same model as frame text editing
// (../frame-inline), which stays on top and never opens at the same time.

// SVG attributes that move or resize a part
const WATCHED_ATTRIBUTES = [
  "x",
  "y",
  "d",
  "r",
  "cx",
  "cy",
  "transform",
  "viewBox",
  "width",
  "height",
  "data-qrdx-part",
];

/** R and Shift+R (a constant: the shortcut hook re-registers on a new key). */
const RANDOM_KEYS = ["r", "R"];

/** The Design section each part's "More options" opens. */
const SECTION: Record<PartId, DesignSection> = {
  eyes: "eyes",
  dots: "dots",
  logo: "logo",
  background: "colors",
  frame: "frame",
};

interface Session {
  part: PartId;
  /** The editor state the edit started from (Escape returns to it) */
  before: ThemeEditorState;
  /** Last place the part was drawn (kept while it isn't, e.g. a hidden logo) */
  anchor: Box;
  outlines: Box[];
  /** Phones get the bottom sheet */
  sheet: boolean;
  /** The eye chosen (an index into EYE_POSITIONS) */
  eye: number;
  /** The eyes' colors go to every eye, or to that one */
  eyeScope: EyeScope;
  /** The content as it was (Escape puts it back; it has no undo step) */
  content: ContentSnapshot;
}

/** The outlines around a part while it's edited. */
function outlinesOf(
  part: PartId,
  measured: MeasuredParts,
  targets: PartTarget[],
  eye: { index: number; scope: EyeScope },
): Box[] {
  if (part === "eyes") {
    const one = measured.eyes[eye.index];
    return eye.scope === "one" && one ? [one] : measured.eyes;
  }
  const anchor = anchorOf(part, measured);
  return (
    targets.find((target) => target.part === part && target.kind === "part")
      ?.boxes ?? (anchor ? [anchor] : [])
  );
}

const currentState = () => useQREditorStore.getState().themeState;

/** Shows `styles` in the preview as part of the open draft (no undo step). */
function draftStyles(styles: QRStyle) {
  useQREditorStore.getState().draftThemeState({ ...currentState(), styles });
}

/** Merges `change` into the design as a draft; cleared options leave it. */
function draftChange(change: Partial<QRStyle>) {
  const next: QRStyle = { ...currentState().styles, ...change };
  for (const key of Object.keys(change) as (keyof QRStyle)[]) {
    if (next[key] === undefined) delete next[key];
  }
  draftStyles(next);
}

/** Another look for `part`, as a style change, or null when there's none. */
function randomChange(
  part: PartId,
  style: QRStyle,
  random: () => number,
): Partial<QRStyle> | null {
  switch (part) {
    case "eyes":
      return randomEyes(style, random);
    case "dots":
      return randomDots(style, random);
    case "background":
      return randomBackground(style, random);
    case "logo": {
      const current = style.showLogo ? logoIconId(style.customLogo) : null;
      const id = randomLogoIcon(current, random);
      const logo = id ? quickIconDataUrl(id) : null;
      return logo ? { customLogo: logo, showLogo: true } : null;
    }
    default:
      // Another frame takes the place of a template inside it too
      return { frame: randomFrame(style.frame, random), templateId: undefined };
  }
}

/** Whether `inner` sits inside `outer` with room for an outline. */
const insideWithRoom = (inner: Box, outer: Box | null) =>
  Boolean(
    outer &&
      inner.left - outer.left > OUTLINE_PAD &&
      inner.top - outer.top > OUTLINE_PAD &&
      outer.left + outer.width - (inner.left + inner.width) > OUTLINE_PAD &&
      outer.top + outer.height - (inner.top + inner.height) > OUTLINE_PAD,
  );

/**
 * The open part's toolbar items. Mounted only while an edit is open: the
 * logo's items work out its size limit from the code's content.
 */
function WithPartItems({
  part,
  styles,
  context,
  children,
}: {
  part: PartId;
  styles: QRStyle;
  context: PartItemsContext;
  children: (items: PartItem[], extra: ReactNode) => ReactNode;
}) {
  const { items, extra } = usePartItems(part, styles, draftChange, context);
  return children(items, extra);
}

/** The logo's move and resize handles, with the size it can grow to. */
function LogoEditHandles({
  styles,
  logo,
  symbol,
  code,
  color,
  onHide,
  onCancel,
}: {
  styles: QRStyle;
  logo: Box;
  symbol: Box;
  code: Box;
  color: string;
  onHide: () => void;
  onCancel: () => void;
}) {
  const current = { ...defaultThemeState.styles, ...styles };
  // The largest logo the code's error correction can repair
  const { maxPercent } = useLogoSize(current);
  return (
    <LogoHandles
      code={code}
      color={color}
      logo={logo}
      maxSize={Math.max(LOGO_SIZE_MIN, maxPercent / 100)}
      onCancel={onCancel}
      onHide={onHide}
      onOptions={(change) =>
        draftChange(
          logoOptionsChange(currentState().styles.logoOptions ?? {}, change),
        )
      }
      size={code.width > 0 ? logo.width / code.width : LOGO_SIZE_MIN}
      symbol={symbol}
    />
  );
}

/** Focuses the first field of the Content tab's form, once it shows. */
function focusContentForm() {
  const field = document.querySelector<HTMLElement>(
    '[role="tabpanel"][data-state="active"] :is(input:not([type=hidden]), textarea, select)',
  );
  field?.focus();
}

export function PartOverlay({
  rootRef,
  frame,
  disabled = false,
}: {
  /** The preview container the overlay covers (positioned) */
  rootRef: RefObject<HTMLElement | null>;
  /** A frame is on (its artwork gets a button) */
  frame: boolean;
  /** An AI art result covers the code */
  disabled?: boolean;
}) {
  const t = useTranslations("editor.partInline");
  const isMobile = useIsMobile();
  const { handleSetTab } = useControlsTabFromUrl();
  const styles = useQREditorStore((state) => state.themeState.styles);
  const value = useQREditorStore((state) => state.value);
  const [measured, setMeasured] = useState<MeasuredParts>(NO_PARTS);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const [highlight, setHighlight] = useState<PartId | null>(null);
  const buttons = useRef(new Map<PartId, HTMLButtonElement>());
  const focusAfterClose = useRef<PartId | null>(null);
  const targets = partTargets(measured, {
    frame,
    shaped: frameShapeOf(styles) !== null,
  });
  const { settings } = useUserSettings();
  const shortcutsEnabled = settings?.keyboardShortcuts ?? true;

  const measure = useCallback(() => {
    const root = rootRef.current;
    const code = root?.querySelector<HTMLElement>(PREVIEW_CODE_SELECTOR);
    const svg = code ? previewFrameSvg(code) : null;
    const next = root && svg ? measureParts(svg, root) : NO_PARTS;
    setMeasured((previous) =>
      partsKey(previous) === partsKey(next) ? previous : next,
    );
  }, [rootRef]);

  // Re-measure whenever the drawing or the panel changes. The code box is
  // remounted when the content changes, so watch the whole container. (A
  // passive effect: the container's ref is set only after this child's
  // layout effects run.)
  useEffect(() => {
    const root = rootRef.current;
    if (!root || disabled) return;
    measure();
    const resize = new ResizeObserver(() => measure());
    resize.observe(root);
    const mutations = new MutationObserver(() => measure());
    mutations.observe(root, {
      attributeFilter: WATCHED_ATTRIBUTES,
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [measure, rootRef, disabled]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the design or the open part changes
  useLayoutEffect(() => {
    measure();
  }, [measure, styles, session?.part]);

  // The open part follows its drawing (and keeps its last place when it
  // isn't drawn, like a logo just hidden)
  useEffect(() => {
    const open = sessionRef.current;
    if (!open) return;
    const anchor = anchorOf(open.part, measured);
    if (!anchor) return;
    setSession((current) =>
      current && current.part === open.part
        ? {
            ...current,
            anchor,
            outlines: outlinesOf(
              current.part,
              measured,
              partTargets(measured, { frame: true }),
              { index: current.eye, scope: current.eyeScope },
            ),
          }
        : current,
    );
  }, [measured]);

  // Back to the part's button after Escape (keyboard flow)
  useEffect(() => {
    if (session || !focusAfterClose.current) return;
    buttons.current.get(focusAfterClose.current)?.focus({
      preventScroll: true,
    });
    focusAfterClose.current = null;
  }, [session]);

  const close = useCallback((focusBack: boolean) => {
    const open = sessionRef.current;
    if (!open) return;
    focusAfterClose.current = focusBack ? open.part : null;
    sessionRef.current = null;
    setSession(null);
  }, []);

  const commit = useCallback(
    (focusBack: boolean) => {
      const open = sessionRef.current;
      if (!open) return;
      useQREditorStore.getState().commitThemeDraft(open.before);
      close(focusBack);
    },
    [close],
  );

  // Unmounted mid-edit (the layout switched between phone and desktop, say):
  // keep the draft as a proper undo step instead of leaving it unrecorded.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(
    () => () => {
      if (sessionRef.current) commitRef.current(false);
    },
    [],
  );

  const cancel = useCallback(() => {
    const open = sessionRef.current;
    if (!open) return;
    useQREditorStore.getState().draftThemeState(open.before);
    restoreContent(open.content);
    close(true);
  }, [close]);

  const start = (part: PartId, eye = 0) => {
    const open = sessionRef.current;
    // Another eye while colors go to one eye: the edit moves to it
    if (
      open?.part === "eyes" &&
      part === "eyes" &&
      open.eyeScope === "one" &&
      open.eye !== eye
    ) {
      setEye(eye);
      return;
    }
    // The part being edited, chosen again: done
    if (open?.part === part) {
      commit(true);
      return;
    }
    if (open) commit(false);
    const anchor = anchorOf(part, measured);
    if (!anchor) return;
    soundEvent("tick");
    const next: Session = {
      part,
      before: currentState(),
      anchor,
      outlines: outlinesOf(part, measured, targets, {
        index: eye,
        scope: "all",
      }),
      sheet: isMobile,
      eye,
      eyeScope: "all",
      content: contentSnapshot(),
    };
    sessionRef.current = next;
    setSession(next);
  };

  const setEye = (eye: number, scope?: EyeScope) =>
    setSession((current) => {
      if (!current) return current;
      const eyeScope = scope ?? current.eyeScope;
      const next = {
        ...current,
        eye,
        eyeScope,
        outlines: outlinesOf("eyes", measured, targets, {
          index: eye,
          scope: eyeScope,
        }),
      };
      sessionRef.current = next;
      return next;
    });

  /** A random look for `part` right away, as its own undo step. */
  const randomNow = (part: PartId) => {
    if (sessionRef.current) {
      random();
      return;
    }
    const change = randomChange(part, currentState().styles, Math.random);
    if (!change) return;
    const before = currentState();
    draftChange(change);
    useQREditorStore.getState().commitThemeDraft(before);
    soundEvent("tick");
  };

  /** Hides the logo right away, as its own undo step. */
  const hideLogoNow = () => {
    const before = currentState();
    draftChange({ showLogo: false });
    useQREditorStore.getState().commitThemeDraft(before);
  };

  /** A dropped image becomes the logo, as its own undo step. */
  const dropLogo = (logo: string) => {
    if (sessionRef.current) commit(false);
    const before = currentState();
    draftChange({ customLogo: logo, showLogo: true });
    useQREditorStore.getState().commitThemeDraft(before);
  };

  /** Keeps the edit and opens the Content tab with its form focused. */
  const openContent = () => {
    commit(false);
    handleSetTab("content");
    // The tab renders on the next frames
    requestAnimationFrame(() =>
      requestAnimationFrame(() => focusContentForm()),
    );
  };

  const random = () => {
    const open = sessionRef.current;
    if (!open) return;
    const change = randomChange(open.part, currentState().styles, Math.random);
    if (!change) return;
    draftChange(change);
    soundEvent("tick");
  };

  const moreOptions = () => {
    const open = sessionRef.current;
    if (!open) return;
    const section = SECTION[open.part];
    commit(false);
    handleSetTab("customisations");
    // Ask again even when the section was asked for before (a closed section)
    const focus = usePlaygroundFocusStore.getState();
    if (focus.section === section) {
      focus.setSection(null);
      requestAnimationFrame(() =>
        usePlaygroundFocusStore.getState().setSection(section),
      );
    } else {
      focus.setSection(section);
    }
  };

  // A click anywhere but the editor, its menus or the part being edited
  // commits (desktop; the sheet handles its own outside clicks).
  useEffect(() => {
    if (!session || session.sheet) return;
    const onPointerDown = (event: PointerEvent) => {
      if (insideInlineEditor(event.target as Element | null, "part")) return;
      commit(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [session, commit]);

  // R gives the open part a random look (not while typing)
  useEffect(() => {
    if (!session) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = partKeyAction({
        key: event.key,
        modifier: event.metaKey || event.ctrlKey || event.altKey,
        typing: isTyping(event.target),
        open: session.part,
        pointed: null,
        logoFocused: false,
      });
      if (action?.type !== "random") return;
      event.preventDefault();
      random();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // R over a hovered or focused part (before the page's own R, Reset)
  useKeyboardShortcut(
    RANDOM_KEYS,
    () => {
      if (highlight) randomNow(highlight);
    },
    {
      enabled: shortcutsEnabled && !session && highlight !== null,
      priority: 10,
    },
  );

  // An AI art result covering the code ends an open edit.
  useEffect(() => {
    if (disabled) commit(false);
  }, [disabled, commit]);

  const root = rootRef.current;
  if (disabled) return null;

  // Outlines contrast with what's under them: the code's own color over the
  // code, the page's text color around it
  const codeColor = getSolidColor(styles.fgColor, "#000000");
  const outlineOver = (part: PartId, box: Box): string | undefined => {
    if (part === "eyes" || part === "logo") return codeColor;
    if (part === "dots" && insideWithRoom(box, measured.background)) {
      return codeColor;
    }
    return;
  };

  return (
    <>
      {/* The parts: a button over each, under the frame text's buttons */}
      <div className="pointer-events-none absolute inset-0">
        {targets.flatMap((target) =>
          target.boxes.map((box, index) => {
            const editing = session?.part === target.part;
            const ring = target.kind === "ring";
            // One Tab stop per part: the first eye, not the ring
            const first = index === 0 && !ring;
            const label = ring
              ? t("parts.background.editShape")
              : t(`parts.${target.part}.edit`);
            const lit = highlight === target.part && !editing;
            const color = outlineOver(target.part, box);
            return (
              <button
                aria-expanded={first ? editing : undefined}
                aria-hidden={first ? undefined : true}
                aria-label={first ? label : undefined}
                className={cn(
                  "pointer-events-auto absolute cursor-pointer rounded-[5px] outline-none transition-shadow",
                  ring && styles.shape === "circle" && "rounded-full",
                  !color && "text-foreground",
                  !editing &&
                    "hover:ring-1 hover:ring-current/45 focus-visible:ring-2 focus-visible:ring-current/70",
                  lit && "ring-1 ring-current/45",
                )}
                // The part being edited stays part of its editor: choosing
                // it again closes the edit instead of committing twice
                data-part-button={target.part}
                {...(editing && { "data-part-inline": "" })}
                key={`${target.part}-${target.kind}-${index}`}
                onBlur={() => setHighlight(null)}
                onClick={() =>
                  start(target.part, target.part === "eyes" ? index : 0)
                }
                onKeyDown={(event) => {
                  if (editing && event.key === "Escape") {
                    event.preventDefault();
                    cancel();
                    return;
                  }
                  const action = partKeyAction({
                    key: event.key,
                    modifier: event.metaKey || event.ctrlKey || event.altKey,
                    typing: false,
                    open: null,
                    pointed: null,
                    logoFocused: target.part === "logo",
                  });
                  if (action?.type !== "hide-logo") return;
                  event.preventDefault();
                  if (editing) draftChange({ showLogo: false });
                  else hideLogoNow();
                }}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible")) {
                    setHighlight(target.part);
                  }
                }}
                onPointerEnter={() => setHighlight(target.part)}
                onPointerLeave={() => setHighlight(null)}
                ref={(node) => {
                  if (!first) return;
                  if (node) buttons.current.set(target.part, node);
                  else buttons.current.delete(target.part);
                }}
                style={{
                  color,
                  zIndex: 1 + target.layer,
                  left: box.left - OUTLINE_PAD,
                  top: box.top - OUTLINE_PAD,
                  width: box.width + 2 * OUTLINE_PAD,
                  height: box.height + 2 * OUTLINE_PAD,
                }}
                tabIndex={first ? 0 : -1}
                title={first || ring ? label : undefined}
                type="button"
              />
            );
          }),
        )}
      </div>

      {/* Direct handles on the code while its part is edited */}
      {session?.part === "logo" &&
        styles.showLogo &&
        measured.logo &&
        measured.symbol &&
        measured.background && (
          <LogoEditHandles
            code={measured.background}
            color={codeColor}
            logo={measured.logo}
            onCancel={cancel}
            onHide={() => draftChange({ showLogo: false })}
            styles={styles}
            symbol={measured.symbol}
          />
        )}
      {session?.part === "background" &&
        measured.background &&
        measured.eyes[0] && (
          <PaddingHandle
            code={measured.background}
            margin={styles.margin ?? 0}
            max={MAX_PADDING}
            onCancel={cancel}
            // A finder eye is 7 modules across
            modulePx={measured.eyes[0].width / 7}
            onMargin={(margin) => {
              if (margin !== (currentState().styles.margin ?? 0)) {
                draftChange({ margin });
              }
            }}
          />
        )}

      <LogoDrop onLogo={dropLogo} rootRef={rootRef} />

      {session && (
        <QRStyleScopeProvider
          onChange={draftStyles}
          style={styles}
          value={value}
        >
          <InsideSidePanel>
            <WithPartItems
              context={{
                eye: EYE_POSITIONS[session.eye] ?? "topLeft",
                eyeScope: session.eyeScope,
                onEyeScope: (scope) => setEye(session.eye, scope),
                onOpenContent: openContent,
              }}
              part={session.part}
              styles={styles}
            >
              {(items, extra) =>
                session.sheet ? (
                  <PartSheet
                    extra={extra}
                    items={items}
                    onCancel={cancel}
                    onCommit={() => commit(true)}
                    onMoreOptions={moreOptions}
                    onRandom={random}
                    part={session.part}
                  />
                ) : (
                  root && (
                    <PartToolbar
                      anchor={session.anchor}
                      artwork={measured.artwork}
                      bounds={{
                        width: root.clientWidth,
                        height: root.clientHeight,
                      }}
                      extra={extra}
                      items={items}
                      onCancel={cancel}
                      onCommit={() => commit(true)}
                      onLeave={() => commit(false)}
                      onMoreOptions={moreOptions}
                      onRandom={random}
                      outlineColor={
                        outlineOver(session.part, session.anchor) ??
                        "var(--foreground)"
                      }
                      outlines={session.outlines}
                      part={session.part}
                    />
                  )
                )
              }
            </WithPartItems>
          </InsideSidePanel>
        </QRStyleScopeProvider>
      )}
    </>
  );
}
