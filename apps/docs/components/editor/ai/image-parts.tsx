"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Gallery,
  Link21,
  MagicStar,
  RotateLeft,
  RotateRight,
  TickCircle,
} from "iconsax-reactjs";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useAvailability } from "@/components/availability-provider";
import { prepareReferenceImage } from "@/components/sections/ai-art/image-utils";
import {
  IMAGE_USE_LABELS,
  type ImagePlacement,
  type ImageUse,
  isImagePlacement,
} from "@/lib/ai/agent/image-uses";
import type { UseImageOutput } from "@/lib/ai/agent/picture-tools";
import type { DesignContent, DesignRecord } from "@/lib/ai/agent/tools";
import { useChatContext } from "@/lib/hooks/use-chat-context";
import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";
import { useArtSessionStore } from "@/store/art-session-store";
import { useQREditorStore } from "@/store/editor-store";
import type { ChatMessage } from "@/types/ai";
import type { ThemeEditorState } from "@/types/editor";
import type { ThemeStyles } from "@/types/theme";
import {
  Changes,
  DesignPreview,
  ScoreLabel,
  StepLine,
  useDesigns,
} from "./agent-parts";
import { browserScore, pickAttachment, prepareAssets } from "./attached-image";
import { contentLabel, hasEditorContent } from "./content-request";
import {
  alternativesFor,
  type PlacementAttempt,
  type PlacementResult,
  runPlacementLoop,
} from "./image-placement";
import { useContentDialog } from "./use-content-dialog";

// The chat cards of the two browser-side tools: use_image (a picture placed,
// scored and repaired here, then Apply or Reject, like apply_design) and
// request_content (the content dialog). Neither sends the picture or the
// content's values anywhere: their outputs hold scores, checks and types.

type Part = ChatMessage["parts"][number];
type PartOf<T extends Part["type"]> = Extract<Part, { type: T }>;

function Card({
  children,
  footer,
}: {
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="bg-card w-full max-w-[550px] overflow-hidden rounded-lg border">
      <div className="p-3">{children}</div>
      <div className="bg-muted/30 flex min-h-11 flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5">
        {footer}
      </div>
    </div>
  );
}

const muted = "text-muted-foreground text-xs";

// ── request_content ────────────────────────────────────────────────────────

export function RequestContentCard({
  part,
  superseded,
}: {
  part: PartOf<"tool-request_content">;
  superseded: boolean;
}) {
  const { addToolOutput, status, isRestored } = useChatContext();
  const busy = status === "submitted" || status === "streaming";
  const fresh = !isRestored(part.toolCallId);
  const pending = part.state === "input-available" && !superseded;
  const contentType = useQREditorStore((state) => state.contentType);
  const filled = useQREditorStore(hasEditorContent);

  const answer = (type: string) =>
    void addToolOutput({
      tool: "request_content",
      toolCallId: part.toolCallId,
      output: { added: true, type },
    });
  const { show, dialog } = useContentDialog({ onDone: answer });

  // Opens by itself once, when the question arrives (not from a saved chat).
  const opened = useRef(false);
  useEffect(() => {
    if (!pending || !fresh || busy || opened.current) return;
    opened.current = true;
    show();
  }, [pending, fresh, busy, show]);

  const output = part.state === "output-available" ? part.output : null;
  const reason = part.input?.reason?.trim();

  return (
    <Card
      footer={
        output ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <TickCircle className="size-3.5" />
            {output.added && output.type
              ? `Added: ${contentLabel(output.type)}`
              : "No content added"}
          </span>
        ) : pending ? (
          <>
            <span className={muted}>
              {filled ? "Your editor has content now." : "No content yet."}
            </span>
            <div className="flex gap-1.5">
              {filled && (
                <Button
                  className="h-8 shadow-none"
                  disabled={busy}
                  onClick={() => answer(contentType)}
                  size="sm"
                  variant="ghost"
                >
                  Use it
                </Button>
              )}
              <Button className="h-8" disabled={busy} onClick={show} size="sm">
                Add content
              </Button>
            </div>
          </>
        ) : (
          <span className={muted}>Not added</span>
        )
      }
    >
      <p className="flex items-start gap-2 text-sm leading-snug">
        <Link21 className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span>
          What should the code open?
          <span className="text-muted-foreground block text-xs">
            {reason
              ? `Add a link or choose a type ${reason}.`
              : "Add a link or choose a type, then the design continues."}
          </span>
        </span>
      </p>
      {dialog}
    </Card>
  );
}

// ── use_image ──────────────────────────────────────────────────────────────

interface Prepared {
  placement: ImagePlacement;
  result: PlacementResult;
  value: string;
  content: DesignContent | null;
  /** The editor's state it was built on; a newer one builds it again */
  basis: ThemeEditorState;
}

/** Built pictures, by tool call and placement: a remounted card reuses them. Memory only. */
const preparedResults = new Map<string, Prepared>();

type Run =
  | { stage: "idle" }
  | { stage: "content" }
  | { stage: "working"; attempts: PlacementAttempt[] }
  | { stage: "ready"; prepared: Prepared }
  | { stage: "error"; message: string };

/** The code the picture goes on: a design from design_qr, or the editor's. */
function placementBase(design: DesignRecord | undefined) {
  const { themeState, value } = useQREditorStore.getState();
  const editor = themeState.styles;
  if (!design) {
    return { style: editor, value, content: null, basis: themeState };
  }
  const logo =
    design.logo === "keep"
      ? { showLogo: editor.showLogo, customLogo: editor.customLogo }
      : design.logo;
  const style: ThemeStyles = {
    ...(editor.size ? { size: editor.size } : {}),
    ...design.themeStyles,
    ...logo,
  };
  return {
    style,
    value: design.content ? design.value : value,
    content: design.content,
    basis: themeState,
  };
}

const PLACE_LABEL: Record<ImagePlacement, string> = {
  logo: "Use as the logo",
  logo_qr: "Use as Logo QR",
  image_qr: "Use as Image QR",
  background: "Use as the background",
  dots: "Use in the dots",
};

export function UseImageCard({
  part,
  superseded,
}: {
  part: PartOf<"tool-use_image">;
  superseded: boolean;
}) {
  const chat = useChatContext();
  const { addToolOutput, status, applied, undoApplied, redoApplied } = chat;
  const busy = status === "submitted" || status === "streaming";
  const designs = useDesigns();
  const fresh = !chat.isRestored(part.toolCallId);
  const input = part.state === "input-streaming" ? undefined : part.input;
  const pending = part.state === "input-available" && !superseded;
  const [use, setUse] = useState<ImageUse | undefined>(input?.as);
  useEffect(() => {
    if (input?.as) setUse((current) => current ?? input.as);
  }, [input?.as]);
  const [run, setRun] = useState<Run>({ stage: "idle" });
  const hasContent = useQREditorStore(hasEditorContent);
  const themeState = useQREditorStore((state) => state.themeState);

  const respond = (output: UseImageOutput) =>
    void addToolOutput({
      tool: "use_image",
      toolCallId: part.toolCallId,
      output,
    });

  const { show, dialog } = useContentDialog({ onDone: () => {} });

  // Build, score and repair the picture for the chosen way (no AI).
  const start = useEffectEvent(
    (placement: ImagePlacement, signal: { cancelled: boolean }) => {
      const key = `${part.toolCallId}:${placement}`;
      const cached = preparedResults.get(key);
      if (cached && cached.basis === themeState) {
        setRun({ stage: "ready", prepared: cached });
        return;
      }
      const src = pickAttachment(chat.messages, input?.image);
      if (!src) {
        setRun({
          stage: "error",
          message: "Attach a picture in the chat, then ask again.",
        });
        return;
      }
      const base = placementBase(
        input?.design_id ? designs.get(input.design_id) : undefined,
      );
      if (!base.value.trim()) {
        setRun({ stage: "content" });
        return;
      }
      setRun({ stage: "working", attempts: [] });
      void (async () => {
        try {
          const assets = await prepareAssets(src, placement);
          const result = await runPlacementLoop({
            value: base.value,
            style: base.style,
            placement,
            assets,
            score: browserScore,
            onAttempt: (attempt) => {
              if (signal.cancelled) return;
              setRun((current) =>
                current.stage === "working"
                  ? { ...current, attempts: [...current.attempts, attempt] }
                  : current,
              );
            },
          });
          if (signal.cancelled) return;
          const prepared: Prepared = {
            placement,
            result,
            value: base.value,
            content: base.content,
            basis: base.basis,
          };
          preparedResults.set(key, prepared);
          setRun({ stage: "ready", prepared });
        } catch (error) {
          if (signal.cancelled) return;
          console.error("Placing the picture failed:", error);
          setRun({
            stage: "error",
            message:
              "This picture didn't load. Attach it as a PNG or JPG and ask again.",
          });
        }
      })();
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again once the dialog adds content
  useEffect(() => {
    if (!pending || !use || !isImagePlacement(use)) return;
    const signal = { cancelled: false };
    start(use, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [pending, use, hasContent]);

  // The dialog opens by itself once, for a request of this visit.
  const opened = useRef(false);
  useEffect(() => {
    if (run.stage !== "content" || !fresh || busy || opened.current) return;
    opened.current = true;
    show();
  }, [run.stage, fresh, busy, show]);

  if (!input) return null;
  const output = part.state === "output-available" ? part.output : null;
  const title = input.summary?.trim() || "Use your picture in the code";

  // ── Done (from this visit or from history) ──
  if (output || !pending) {
    const outcome = applied[part.toolCallId];
    return (
      <Card
        footer={
          output?.applied ? (
            outcome === "undone" ? (
              <>
                <span className={muted}>Undone</span>
                <Button
                  className="h-7 gap-1.5 shadow-none"
                  onClick={() => redoApplied(part.toolCallId)}
                  size="sm"
                  variant="ghost"
                >
                  <RotateRight className="size-3.5" />
                  Apply again
                </Button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <TickCircle className="size-3.5" />
                  Applied
                </span>
                {outcome === "applied" && (
                  <Button
                    className="h-7 gap-1.5 shadow-none"
                    onClick={() => undoApplied(part.toolCallId)}
                    size="sm"
                    variant="ghost"
                  >
                    <RotateLeft className="size-3.5" />
                    Undo
                  </Button>
                )}
              </>
            )
          ) : output?.as === "ai_art" && output.note ? (
            <span className={muted}>Opened AI art in the Art tab</span>
          ) : (
            <span className={muted}>
              Not applied. Your editor is unchanged.
            </span>
          )
        }
      >
        <p className="flex items-start gap-2 text-sm leading-snug">
          <Gallery className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 space-y-1">
            <span className="block font-medium">{title}</span>
            {output?.score !== undefined && output.grade && (
              <ScoreLabel grade={output.grade} score={output.score} />
            )}
            {output && output.as !== input.as && (
              <span className={`${muted} block`}>
                Placed as {IMAGE_USE_LABELS[output.as]}
              </span>
            )}
          </span>
        </p>
      </Card>
    );
  }

  // ── AI art: handed to the Art tab, never run from here ──
  if (use === "ai_art") {
    return (
      <AIArtHandOff
        image={input.image}
        onDone={() =>
          respond({
            applied: false,
            as: "ai_art",
            note: "Opened the AI art panel in the Art tab with the picture as its reference. The user starts it there; it uses their AI art credits.",
          })
        }
        onUseImageQr={() => setUse("image_qr")}
        title={title}
      />
    );
  }

  // ── Placing it ──
  const prepared = run.stage === "ready" ? run.prepared : null;
  const result = prepared?.result;
  const great = result?.grade === "great";
  const placement = use && isImagePlacement(use) ? use : "image_qr";

  return (
    <Card
      footer={
        prepared && result && great ? (
          <>
            <span className={muted}>Apply to your editor?</span>
            <div className="flex gap-1.5">
              <Button
                className="h-8"
                disabled={busy}
                onClick={() => {
                  chat.applyChange(part.toolCallId, {
                    themeStyles: result.style,
                    logo: {
                      showLogo: Boolean(result.style.showLogo),
                      customLogo: result.style.customLogo,
                    },
                    content: prepared.content,
                  });
                  respond({
                    applied: true,
                    as: prepared.placement,
                    score: result.score,
                    grade: result.grade,
                    changes: result.changes,
                    stillFailing: [],
                  });
                }}
                size="sm"
              >
                Apply
              </Button>
              <Button
                className="h-8 shadow-none"
                disabled={busy}
                onClick={() =>
                  respond({
                    applied: false,
                    as: prepared.placement,
                    score: result.score,
                    grade: result.grade,
                    note: "The user rejected it. The editor is unchanged.",
                  })
                }
                size="sm"
                variant="ghost"
              >
                Reject
              </Button>
            </div>
          </>
        ) : prepared && result ? (
          <>
            <span className={muted}>Not Great yet. Try another way above.</span>
            <Button
              className="h-8 shadow-none"
              disabled={busy}
              onClick={() =>
                respond({
                  applied: false,
                  as: prepared.placement,
                  score: result.score,
                  grade: result.grade,
                  stillFailing: result.failed.map((check) => check.message),
                  note: "It didn't reach Great, so the user kept the editor as it was.",
                })
              }
              size="sm"
              variant="ghost"
            >
              Keep my code
            </Button>
          </>
        ) : run.stage === "content" ? (
          <>
            <span className={muted}>Add what the code opens first.</span>
            <Button className="h-8" disabled={busy} onClick={show} size="sm">
              Add content
            </Button>
          </>
        ) : run.stage === "error" ? (
          <span className={muted}>{run.message}</span>
        ) : (
          <span className={`${muted} inline-flex items-center gap-1.5`}>
            <Spinner className="size-3.5" />
            Placing your picture…
          </span>
        )
      }
    >
      <div className="flex gap-3">
        {prepared && result ? (
          <DesignPreview
            logo={{
              showLogo: Boolean(result.style.showLogo),
              customLogo: result.style.customLogo,
            }}
            styles={result.style}
            value={prepared.value}
          />
        ) : (
          <div className="bg-muted/40 grid size-24 shrink-0 place-items-center rounded-md border">
            <Gallery className="text-muted-foreground size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-sm font-medium leading-snug">{title}</p>
            <p className={muted}>
              As {IMAGE_USE_LABELS[placement]}, with no AI credits
            </p>
            {result && <ScoreLabel grade={result.grade} score={result.score} />}
          </div>
          {run.stage === "working" && (
            <ul aria-label="Steps" className="space-y-0.5">
              <StepLine status={run.attempts.length ? "done" : "running"}>
                {run.attempts.length
                  ? "Placed your picture"
                  : "Placing your picture…"}
              </StepLine>
              {run.attempts.map((attempt, index) => (
                <StepLine key={`${index}-${attempt.score}`} status="done">
                  {index > 0 ? "Repaired, then checked" : "Checked"} scan score:{" "}
                  {attempt.score}
                </StepLine>
              ))}
            </ul>
          )}
          {prepared && result && prepared.content && (
            <p className="text-xs">
              Replaces the content with {prepared.content.summary}
            </p>
          )}
          {result && great && <Changes changes={result.changes} />}
          {result && !great && (
            <NotGreat
              busy={busy}
              onTry={setUse}
              placement={placement}
              result={result}
            />
          )}
        </div>
      </div>
      {dialog}
    </Card>
  );
}

/** Why a placement isn't Great, what to change, and the other ways to try. */
function NotGreat({
  result,
  placement,
  onTry,
  busy,
}: {
  result: PlacementResult;
  placement: ImagePlacement;
  onTry: (use: ImagePlacement) => void;
  busy: boolean;
}) {
  const why = result.failed.slice(0, 2);
  return (
    <div className="space-y-2">
      {why.length > 0 && (
        <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs leading-5">
          {why.map((check) => (
            <li key={check.id}>
              {check.message}
              {check.fix ? ` ${check.fix}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        {alternativesFor(placement).map((other) => (
          <Button
            className="h-7 rounded-full px-3 text-xs shadow-none"
            disabled={busy}
            key={other}
            onClick={() => onTry(other)}
            size="sm"
            variant="outline"
          >
            {PLACE_LABEL[other]}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** AI art: opens the Art tab's AI art panel with the picture as its reference. */
function AIArtHandOff({
  title,
  image,
  onDone,
  onUseImageQr,
}: {
  title: string;
  image: number | undefined;
  onDone: () => void;
  onUseImageQr: () => void;
}) {
  const { messages, status } = useChatContext();
  const busy = status === "submitted" || status === "streaming";
  const configured = useArtSessionStore((state) => state.configured);
  const available = useAvailability().has("aiArt") && configured;
  const { handleSetTab } = useControlsTabFromUrl();
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async () => {
    const src = pickAttachment(messages, image);
    if (!src) {
      setProblem("Attach a picture in the chat, then ask again.");
      return;
    }
    setOpening(true);
    try {
      const reference = await prepareReferenceImage(src);
      const session = useArtSessionStore.getState();
      session.updateDraft({ reference, referenceIsLogo: false });
      session.pick("ai");
      onDone();
      handleSetTab("art");
    } catch {
      setProblem("This picture didn't load. Attach a PNG or JPG instead.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card
      footer={
        available ? (
          <>
            <span className={muted}>
              {problem ??
                "You start it in the Art tab. It uses AI art credits."}
            </span>
            <Button
              className="h-8"
              disabled={busy || opening}
              onClick={() => void open()}
              size="sm"
            >
              {opening && <Spinner className="size-3.5" />}
              Open AI art
            </Button>
          </>
        ) : (
          <>
            <span className={muted}>
              AI art isn't on here. Image QR uses your picture with no AI.
            </span>
            <Button
              className="h-8"
              disabled={busy}
              onClick={onUseImageQr}
              size="sm"
            >
              Use as Image QR
            </Button>
          </>
        )
      }
    >
      <p className="flex items-start gap-2 text-sm leading-snug">
        <MagicStar className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span>
          <span className="block font-medium">{title}</span>
          <span className={`${muted} block`}>
            AI paints a new scene into your code, with your picture as the
            reference.
          </span>
        </span>
      </p>
    </Card>
  );
}
