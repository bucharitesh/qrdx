"use client";

import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import type { AnyQRFrame } from "qrdx";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import { usePlaygroundFocusStore } from "@/store/playground-focus-store";
import type { ThemeEditorState } from "@/types/editor";
import {
  clampFrameText,
  type FrameTextTarget,
  type FrameTweak,
  frameTextTarget,
  frameTweaks,
  withFrameText,
  withFrameTweak,
} from "./frame-text-fields";
import { FrameTextSheet } from "./frame-text-sheet";
import { InlineFrameEditor } from "./inline-frame-editor";
import { insideInlineEditor } from "./inline-toolbar";
import {
  type Box,
  measureArtwork,
  measurePreviewLabels,
  type PreviewLabel,
  previewFrameSvg,
  setLabelHidden,
} from "./preview-labels";

// Frame text in the playground preview, editable where it's drawn: each
// label gets a button over it (hover shows an outline, Tab reaches it), and
// choosing one puts an input exactly over the text with a small menu beside
// it (a bottom sheet on phones). Edits show live as a draft in the editor
// store, so the preview and scan score follow every keystroke; Enter or a
// click outside records the whole edit as one undo step, Escape puts the
// frame back as it was.

/** The code box in the preview (QRPreviewPanel marks it). */
export const PREVIEW_CODE_SELECTOR = "[data-preview-code]";

// SVG attributes that move or restyle a label (not the style we set on it)
const WATCHED_ATTRIBUTES = [
  "x",
  "y",
  "d",
  "fill",
  "font-size",
  "font-weight",
  "text-anchor",
  "transform",
  "viewBox",
  "width",
  "height",
  "data-max-width",
  "data-qrdx-frame-label",
];

interface Session {
  marker: string;
  target: FrameTextTarget;
  /** The editor state the edit started from (Escape returns to it) */
  before: ThemeEditorState;
  /** The input's text, as typed */
  text: string;
  /** Last place the label was drawn (kept while it's empty and hidden) */
  label: PreviewLabel;
  /** Phones get the bottom sheet */
  sheet: boolean;
}

const key = (labels: PreviewLabel[]) =>
  JSON.stringify(
    labels.map((label) => [
      label.marker,
      Math.round(label.box.left * 2),
      Math.round(label.box.top * 2),
      Math.round(label.box.width * 2),
      Math.round(label.box.height * 2),
      Math.round(label.fontSize * 4),
      label.fill,
      label.behind,
    ]),
  );

const currentState = () => useQREditorStore.getState().themeState;

/** Shows `frame` in the preview as part of the open draft (no undo step). */
function draftFrame(frame: AnyQRFrame) {
  const state = currentState();
  useQREditorStore
    .getState()
    .draftThemeState({ ...state, styles: { ...state.styles, frame } });
}

export function FrameTextOverlay({
  rootRef,
  frame,
  disabled = false,
}: {
  /** The preview container the overlay covers (positioned) */
  rootRef: RefObject<HTMLElement | null>;
  frame: AnyQRFrame | undefined;
  /** An AI art result covers the code */
  disabled?: boolean;
}) {
  const t = useTranslations("editor.frameInline.frameTextOverlay");
  const isMobile = useIsMobile();
  const { handleSetTab } = useControlsTabFromUrl();
  const [labels, setLabels] = useState<PreviewLabel[]>([]);
  const [artwork, setArtwork] = useState<Box | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterClose = useRef<string | null>(null);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const code = root?.querySelector<HTMLElement>(PREVIEW_CODE_SELECTOR);
    const svg = code ? previewFrameSvg(code) : null;
    if (!(root && svg)) {
      setLabels((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    const next = measurePreviewLabels(svg, root);
    const art = measureArtwork(svg, root);
    setArtwork((previous) =>
      JSON.stringify(previous) === JSON.stringify(art) ? previous : art,
    );
    const open = sessionRef.current;
    const editing = open && next.find((label) => label.marker === open.marker);
    // The input stands in for straight text; curved letters stay drawn.
    setLabelHidden(
      svg,
      open && !open.sheet && editing && !editing.curved ? open.marker : null,
    );
    if (open && editing) {
      setSession((current) =>
        current &&
        current.marker === editing.marker &&
        key([current.label]) !== key([editing])
          ? { ...current, label: editing }
          : current,
      );
    }
    setLabels((previous) => (key(previous) === key(next) ? previous : next));
  }, [rootRef]);

  // Re-measure whenever the drawing or the panel changes. The code box is
  // remounted when the content changes, so watch the whole container. (A
  // passive effect: the container's ref is set only after this child's
  // layout effects run.)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    measure();
    const resize = new ResizeObserver(() => measure());
    resize.observe(root);
    const mutations = new MutationObserver(() => measure());
    mutations.observe(root, {
      attributeFilter: WATCHED_ATTRIBUTES,
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [measure, rootRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the frame or the open label changes
  useLayoutEffect(() => {
    measure();
  }, [measure, frame, session?.marker]);

  // Back to the label's button after Enter or Escape (keyboard flow)
  useEffect(() => {
    if (session || !focusAfterClose.current) return;
    buttons.current.get(focusAfterClose.current)?.focus({
      preventScroll: true,
    });
    focusAfterClose.current = null;
  }, [session]);

  const close = useCallback(
    (focusBack: boolean) => {
      const open = sessionRef.current;
      if (!open) return;
      focusAfterClose.current = focusBack ? open.marker : null;
      sessionRef.current = null;
      setSession(null);
      const svg = rootRef.current?.querySelector<HTMLElement>(
        PREVIEW_CODE_SELECTOR,
      );
      const frameSvg = svg ? previewFrameSvg(svg) : null;
      if (frameSvg) setLabelHidden(frameSvg, null);
    },
    [rootRef],
  );

  const commit = useCallback(
    (focusBack: boolean) => {
      const open = sessionRef.current;
      if (!open) return;
      const live = currentState().styles.frame;
      if (live && open.text !== open.target.value) {
        draftFrame(
          withFrameText(live, open.target, open.text, { commit: true }),
        );
      }
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

  const start = (label: PreviewLabel) => {
    if (sessionRef.current?.marker === label.marker) return;
    if (sessionRef.current) commit(false);
    const target = frameTextTarget(currentState().styles.frame, label.marker);
    if (!target) return;
    soundEvent("tick");
    const next: Session = {
      marker: label.marker,
      target,
      before: currentState(),
      text: target.value,
      label,
      sheet: isMobile,
    };
    sessionRef.current = next;
    setSession(next);
  };

  const type = (value: string) => {
    const open = sessionRef.current;
    const live = currentState().styles.frame;
    if (!(open && live)) return;
    const text = clampFrameText(value, open.target.maxLength);
    setSession({ ...open, text });
    draftFrame(withFrameText(live, open.target, text));
  };

  const tweak = (change: FrameTweak) => {
    const live = currentState().styles.frame;
    if (!(sessionRef.current && live)) return;
    draftFrame(withFrameTweak(live, change));
  };

  const moreOptions = () => {
    commit(false);
    handleSetTab("customisations");
    // Ask again even when Frame was asked for before (a closed section)
    const focus = usePlaygroundFocusStore.getState();
    if (focus.section === "frame") {
      focus.setSection(null);
      requestAnimationFrame(() =>
        usePlaygroundFocusStore.getState().setSection("frame"),
      );
    } else {
      focus.setSection("frame");
    }
  };

  // A click anywhere but the editor and its menus commits (desktop; the
  // sheet handles its own outside clicks).
  useEffect(() => {
    if (!session || session.sheet) return;
    const onPointerDown = (event: PointerEvent) => {
      if (insideInlineEditor(event.target as Element | null, "frame")) {
        return;
      }
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

  if (disabled) return null;

  const liveFrame = frame;
  const tweaks = session && liveFrame ? frameTweaks(liveFrame) : null;
  const root = rootRef.current;

  return (
    <>
      {/* The labels: a button over each (under the scan score badge) */}
      <div className="pointer-events-none absolute inset-0 z-[5]">
        {labels.map((label) => {
          const target = frameTextTarget(liveFrame, label.marker);
          if (!target) return null;
          const editingHere =
            session?.marker === label.marker && !session.sheet;
          const pad = 4;
          return (
            <button
              aria-label={t("editFrameTextValue", { value: target.value })}
              className={cn(
                "pointer-events-auto absolute cursor-text rounded-[5px] outline-none transition-shadow",
                "hover:ring-1 hover:ring-current/45 focus-visible:ring-2 focus-visible:ring-current/70",
                editingHere && "invisible",
              )}
              data-frame-label-button={label.marker}
              key={label.marker}
              onClick={() => start(label)}
              ref={(node) => {
                if (node) buttons.current.set(label.marker, node);
                else buttons.current.delete(label.marker);
              }}
              style={{
                color: label.fill,
                left: label.box.left - pad,
                top: label.box.top - pad,
                width: label.box.width + 2 * pad,
                height: label.box.height + 2 * pad,
              }}
              tabIndex={editingHere ? -1 : 0}
              title={t("editText")}
              type="button"
            />
          );
        })}
      </div>

      {session && tweaks && !session.sheet && root && (
        <InlineFrameEditor
          artwork={artwork}
          bounds={{ width: root.clientWidth, height: root.clientHeight }}
          label={session.label}
          onCancel={cancel}
          onCommit={() => commit(true)}
          onLeave={() => commit(false)}
          onMoreOptions={moreOptions}
          onText={type}
          onTweak={tweak}
          target={session.target}
          text={session.text}
          tweaks={tweaks}
        />
      )}

      {session && tweaks && session.sheet && (
        <FrameTextSheet
          label={session.label}
          onCancel={cancel}
          onCommit={() => commit(true)}
          onMoreOptions={moreOptions}
          onText={type}
          onTweak={tweak}
          target={session.target}
          text={session.text}
          tweaks={tweaks}
        />
      )}
    </>
  );
}
