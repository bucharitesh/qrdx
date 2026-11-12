"use client";

import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { getSolidColor } from "qrdx/types";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";
import type { DesignSection } from "@/lib/playground-links";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import { usePlaygroundFocusStore } from "@/store/playground-focus-store";
import type { ThemeEditorState } from "@/types/editor";
import type { QRStyle } from "@/types/theme";
import { logoIconId, quickIconDataUrl } from "../control-sections/logo-presets";
import { InsideSidePanel } from "../control-sections/side-panel";
import { PREVIEW_CODE_SELECTOR } from "../frame-inline/frame-text-overlay";
import { insideInlineEditor } from "../frame-inline/inline-toolbar";
import { type Box, previewFrameSvg } from "../frame-inline/preview-labels";
import { QRStyleScopeProvider } from "../style-scope";
import { measureParts, partsKey } from "./part-boxes";
import { type PartItem, usePartItems } from "./part-controls";
import { PartSheet } from "./part-sheet";
import {
  anchorOf,
  type MeasuredParts,
  NO_PARTS,
  type PartId,
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
      return { frame: randomFrame(style.frame, random) };
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
  children,
}: {
  part: PartId;
  styles: QRStyle;
  children: (items: PartItem[], extra: ReactNode) => ReactNode;
}) {
  const { items, extra } = usePartItems(part, styles, draftChange);
  return children(items, extra);
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
  const targets = partTargets(measured, { frame });

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
    const outlines =
      open.part === "eyes"
        ? measured.eyes
        : (partTargets(measured, { frame: true }).find(
            (target) => target.part === open.part,
          )?.boxes ?? [anchor]);
    setSession((current) =>
      current && current.part === open.part
        ? { ...current, anchor, outlines }
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
    close(true);
  }, [close]);

  const start = (part: PartId) => {
    const open = sessionRef.current;
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
      outlines:
        part === "eyes"
          ? measured.eyes
          : (targets.find((target) => target.part === part)?.boxes ?? [anchor]),
      sheet: isMobile,
    };
    sessionRef.current = next;
    setSession(next);
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
            const first = index === 0;
            const lit = highlight === target.part && !editing;
            const color = outlineOver(target.part, box);
            return (
              <button
                aria-expanded={first ? editing : undefined}
                aria-hidden={first ? undefined : true}
                aria-label={first ? t(`parts.${target.part}.edit`) : undefined}
                className={cn(
                  "pointer-events-auto absolute cursor-pointer rounded-[5px] outline-none transition-shadow",
                  !color && "text-foreground",
                  !editing &&
                    "hover:ring-1 hover:ring-current/45 focus-visible:ring-2 focus-visible:ring-current/70",
                  lit && "ring-1 ring-current/45",
                )}
                // The part being edited stays part of its editor: choosing
                // it again closes the edit instead of committing twice
                data-part-button={target.part}
                {...(editing && { "data-part-inline": "" })}
                key={`${target.part}-${index}`}
                onBlur={() => setHighlight(null)}
                onClick={() => start(target.part)}
                onKeyDown={(event) => {
                  if (editing && event.key === "Escape") {
                    event.preventDefault();
                    cancel();
                  }
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
                title={first ? t(`parts.${target.part}.edit`) : undefined}
                type="button"
              />
            );
          }),
        )}
      </div>

      {session && (
        <QRStyleScopeProvider
          onChange={draftStyles}
          style={styles}
          value={value}
        >
          <InsideSidePanel>
            <WithPartItems part={session.part} styles={styles}>
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
