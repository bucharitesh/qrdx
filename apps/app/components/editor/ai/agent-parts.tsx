"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import {
  CloseCircle,
  MessageQuestion,
  RotateLeft,
  RotateRight,
  TickCircle,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { QRCodeSVG, type ScanGrade } from "qrdx";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { GRADE_COLORS, useGradeLabels } from "@/components/editor/scan-score";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import type {
  DesignLogo,
  DesignProgress,
  DesignQrOutput,
  DesignRecord,
} from "@/lib/ai/agent/tools";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { useChatContext } from "@/lib/hooks/use-chat-context";
import { designQRProps } from "@/lib/qr-design/props";
import { dashboardEntry } from "@/lib/workspace-paths";
import { useQREditorStore } from "@/store/editor-store";
import type { ChatMessage } from "@/types/ai";
import type { ThemeStyles } from "@/types/theme";

// How the agent's tool calls show in the chat: a compact list of steps for
// the design work, option chips for questions, and Approve / Reject cards
// for the two changes it can make (the editor, the user's templates). The
// community publish card is in ./publish-card.tsx.

type Part = ChatMessage["parts"][number];
type PartOf<T extends Part["type"]> = Extract<Part, { type: T }>;

/** Designs made in this chat, by id, for the cards that apply or save them. */
export function useDesigns(): Map<string, DesignRecord> {
  const { messages } = useChatContext();
  return useMemo(() => {
    const designs = new Map<string, DesignRecord>();
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type === "tool-design_qr" &&
          part.state === "output-available"
        ) {
          const output = part.output as DesignQrOutput;
          if (output.ok) designs.set(part.toolCallId, output);
        }
      }
    }
    return designs;
  }, [messages]);
}

// ── Pieces ─────────────────────────────────────────────────────────────────

export function ScoreLabel({
  score,
  grade,
  className,
}: {
  score: number;
  grade: ScanGrade;
  className?: string;
}) {
  const gradeLabels = useGradeLabels();
  const t = useTranslations("editor.ai.agentParts");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", GRADE_COLORS[grade])} />
      {t("scanScoreScoreValue", { score, value: gradeLabels[grade] })}
    </span>
  );
}

export function StepLine({
  status,
  children,
}: {
  status: "running" | "done" | "failed";
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 text-xs leading-5">
      <span className="grid size-5 shrink-0 place-items-center">
        {status === "running" ? (
          <ModuleOrbit aria-hidden className="text-muted-foreground size-3.5" />
        ) : status === "done" ? (
          <TickCircle className="text-muted-foreground size-3.5" />
        ) : (
          <CloseCircle className="text-muted-foreground size-3.5" />
        )}
      </span>
      <span className="text-muted-foreground min-w-0">{children}</span>
    </li>
  );
}

const shortChanges = (changes: string[]) =>
  changes.length > 2
    ? `${changes.slice(0, 2).join(", ")} and ${changes.length - 2} more`
    : changes.join(", ");

/** The code as the design will look: its own content, or the editor's. */
export function DesignPreview({
  value,
  styles,
  logo,
  size = 96,
}: {
  value: string;
  styles: ThemeStyles;
  logo: DesignLogo;
  size?: number;
}) {
  const editor = useQREditorStore((state) => state.themeState.styles);
  const resolved =
    logo === "keep"
      ? { showLogo: editor.showLogo, customLogo: editor.customLogo }
      : logo;
  const props = designQRProps(
    value,
    { ...styles, showLogo: resolved.showLogo },
    resolved.customLogo ?? DEFAULT_QR_LOGO,
  );
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-md border bg-white p-1.5 [&_svg]:size-full"
      style={{ width: size, height: size }}
    >
      {/* At the props' own size (the logo is sized for it); CSS scales it. */}
      <QRCodeSVG {...props} />
    </div>
  );
}

/** The value a design shows: its new content, or what the editor holds. */
export function useDesignValue(design: DesignRecord | undefined) {
  const editorValue = useQREditorStore((state) => state.value);
  if (!design) return editorValue;
  if (design.content || design.scoredWithSample) return design.value;
  return editorValue || design.value;
}

// ── design_qr and check_scan_score: steps ──────────────────────────────────

export function DesignSteps({
  part,
  active,
  retried = false,
}: {
  part: PartOf<"tool-design_qr">;
  /** This request is still running */
  active: boolean;
  /** A later design_qr call in the same message followed this one */
  retried?: boolean;
}) {
  const gradeLabels = useGradeLabels();
  const t = useTranslations("editor.ai.agentParts");
  const { designProgress, stop } = useChatContext();
  const live: DesignProgress[] = designProgress[part.toolCallId] ?? [];
  const output = part.state === "output-available" ? part.output : null;
  const running = !output && part.state !== "output-error" && active;

  const contentLine =
    output?.ok && output.content ? output.content.summary : null;

  // A call the model made with malformed input; it retries on its own, so
  // say so only when nothing in the message worked.
  if (part.state === "output-error") {
    return retried ? null : (
      <ul>
        <StepLine status="failed">{t("theDesignStepFailedTry")}</StepLine>
      </ul>
    );
  }

  if (output && !output.ok) {
    return (
      <ul className="space-y-0.5">
        <StepLine status="failed">
          {t("theContentNeedsAFix", {
            value: output.issues.map((issue) => issue.message).join("; "),
          })}
        </StepLine>
      </ul>
    );
  }

  const attempts = output?.ok
    ? output.attempts
    : live.flatMap((entry) => (entry.stage === "scored" ? [entry] : []));
  const designing = running && attempts.length === 0;

  return (
    <ul aria-label={t("steps")} className="space-y-0.5">
      {contentLine && (
        <StepLine status="done">
          {t("setTheContentContentline", { contentLine })}
        </StepLine>
      )}
      <StepLine status={designing ? "running" : "done"}>
        {designing ? t("designingTheStyle") : t("designedTheStyle")}
      </StepLine>
      {attempts.map((attempt, index) => (
        <Fragment key={`${index}-${attempt.score}`}>
          {attempt.by !== "initial" && attempt.changes.length > 0 && (
            <StepLine status="done">
              {attempt.by === "fallback"
                ? t("fellBackToAClassic")
                : t("repairedValue", { value: shortChanges(attempt.changes) })}
            </StepLine>
          )}
          <StepLine status="done">
            {t("checkedScanScoreScoreValue", {
              score: attempt.score,
              value: gradeLabels[attempt.grade],
            })}
          </StepLine>
        </Fragment>
      ))}
      {running && attempts.length > 0 && attempts.at(-1)?.grade !== "great" && (
        <StepLine status="running">{t("repairing")}</StepLine>
      )}
      {running && (
        <li className="pl-7">
          <button
            className="text-muted-foreground hover:text-foreground text-xs underline decoration-current/30 underline-offset-4"
            onClick={() => stop()}
            type="button"
          >
            {t("stop")}
          </button>
        </li>
      )}
    </ul>
  );
}

export function ScoreCheckStep({
  part,
}: {
  part: PartOf<"tool-check_scan_score">;
}) {
  const gradeLabels = useGradeLabels();
  const t = useTranslations("editor.ai.agentParts");
  if (part.state !== "output-available") {
    return (
      <ul>
        <StepLine status={part.state === "output-error" ? "failed" : "running"}>
          {part.state === "output-error"
            ? t("couldntCheckTheScanScore")
            : t("checkingTheScanScore")}
        </StepLine>
      </ul>
    );
  }
  const { score, grade, failed } = part.output;
  return (
    <ul className="space-y-0.5">
      <StepLine status="done">
        {t("checkedScanScore")} {score} · {gradeLabels[grade]}
        {failed.length > 0 && (
          <span className="block">
            {failed.map((check) => check.message).join("; ")}
          </span>
        )}
      </StepLine>
    </ul>
  );
}

// ── ask_user ───────────────────────────────────────────────────────────────

export function AskUserCard({
  part,
  superseded,
}: {
  part: PartOf<"tool-ask_user">;
  /** The user wrote something else instead of answering */
  superseded: boolean;
}) {
  const t = useTranslations("editor.ai.agentParts");
  const { addToolOutput, status } = useChatContext();
  const [other, setOther] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const input = part.input;
  if (!input?.question) return null;

  const answer = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    void addToolOutput({
      tool: "ask_user",
      toolCallId: part.toolCallId,
      output: { answer: trimmed },
    });
  };

  const answered =
    part.state === "output-available" ? part.output.answer : null;
  const options = (input.options ?? [])
    .filter((option): option is string => Boolean(option))
    .slice(0, 5);
  const open = part.state === "input-available" && !superseded;

  return (
    <div className="bg-card w-full max-w-[550px] space-y-2.5 rounded-lg border p-3">
      <p className="flex items-start gap-2 text-sm leading-snug">
        <MessageQuestion className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span>{input.question}</span>
      </p>
      {answered !== null ? (
        <p className="text-muted-foreground pl-6 text-xs">
          {t("youAnsweredAnswered", { answered })}
        </p>
      ) : !open ? (
        <p className="text-muted-foreground pl-6 text-xs">{t("notAnswered")}</p>
      ) : (
        <div className="space-y-2 pl-6">
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <Button
                className="h-7 rounded-full px-3 text-xs shadow-none"
                disabled={busy}
                key={option}
                onClick={() => answer(option)}
                size="sm"
                variant="outline"
              >
                {option}
              </Button>
            ))}
          </div>
          {input.allow_other !== false && (
            <form
              className="flex gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                answer(other);
              }}
            >
              <Input
                aria-label={t("yourAnswer")}
                className="h-8 text-xs"
                disabled={busy}
                onChange={(event) => setOther(event.target.value)}
                placeholder={t("orTypeYourAnswer")}
                value={other}
              />
              <Button
                className="h-8 shadow-none"
                disabled={busy || !other.trim()}
                size="sm"
                type="submit"
                variant="outline"
              >
                {t("send")}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── Approval cards ─────────────────────────────────────────────────────────

function ApprovalButtons({
  approvalId,
  approveLabel,
}: {
  approvalId: string;
  approveLabel: string;
}) {
  const t = useTranslations("editor.ai.agentParts");
  const { addToolApprovalResponse, status } = useChatContext();
  const busy = status === "submitted" || status === "streaming";
  return (
    <div className="flex gap-1.5">
      <Button
        className="h-8"
        disabled={busy}
        onClick={() =>
          void addToolApprovalResponse({ id: approvalId, approved: true })
        }
        size="sm"
      >
        {approveLabel}
      </Button>
      <Button
        className="h-8 shadow-none"
        disabled={busy}
        onClick={() =>
          void addToolApprovalResponse({ id: approvalId, approved: false })
        }
        size="sm"
        variant="ghost"
      >
        {t("reject")}
      </Button>
    </div>
  );
}

export function Changes({ changes }: { changes: string[] }) {
  const t = useTranslations("editor.ai.agentParts");
  const [open, setOpen] = useState(false);
  if (changes.length === 0) return null;
  const shown = open ? changes : changes.slice(0, 3);
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{t("changedToGetThere")}</p>
      <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs leading-5">
        {shown.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
      {changes.length > 3 && (
        <button
          className="text-muted-foreground hover:text-foreground text-xs underline decoration-current/30 underline-offset-4"
          onClick={() => setOpen(!open)}
          type="button"
        >
          {open
            ? t("showLess")
            : t("showValueMore", { value: changes.length - 3 })}
        </button>
      )}
    </div>
  );
}

export function ApplyDesignCard({
  part,
  superseded,
}: {
  part: PartOf<"tool-apply_design">;
  superseded: boolean;
}) {
  const t = useTranslations("editor.ai.agentParts");
  const designs = useDesigns();
  const { applied, undoApplied, redoApplied } = useChatContext();
  const design = part.input?.design_id
    ? designs.get(part.input.design_id)
    : undefined;
  const value = useDesignValue(design);
  if (!design) return null;

  const state = part.state;
  const outcome = applied[part.toolCallId];
  const denied =
    state === "output-denied" ||
    (state === "approval-responded" && part.approval?.approved === false);
  const automaticReason =
    "approval" in part && part.approval?.isAutomatic
      ? part.approval.reason
      : null;

  return (
    <div className="bg-card w-full max-w-[550px] overflow-hidden rounded-lg border">
      <div className="flex gap-3 p-3">
        <DesignPreview
          logo={design.logo}
          styles={design.themeStyles}
          value={value}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-sm font-medium leading-snug">
              {part.input?.summary || t("applyThisDesign")}
            </p>
            <ScoreLabel grade={design.grade} score={design.score} />
            {design.scoredWithSample && (
              <p className="text-muted-foreground text-xs">
                {t("scoredWithASampleLink")}
              </p>
            )}
          </div>
          {design.content && (
            <p className="text-xs">
              {t("replacesTheContentWithSummary", {
                summary: design.content.summary,
              })}
            </p>
          )}
          {design.replacesArt && (
            <p className="text-xs">{t("turnsOffTheLogoQr")}</p>
          )}
          <Changes changes={design.changes} />
        </div>
      </div>
      <div className="bg-muted/30 flex min-h-11 items-center justify-between gap-2 border-t px-3 py-1.5">
        {state === "approval-requested" &&
        !superseded &&
        !part.approval.isAutomatic ? (
          <>
            <span className="text-muted-foreground text-xs">
              {t("applyToYourEditor")}
            </span>
            <ApprovalButtons
              approvalId={part.approval.id}
              approveLabel="Apply"
            />
          </>
        ) : state === "output-available" && part.output.ok ? (
          outcome === "undone" ? (
            <>
              <span className="text-muted-foreground text-xs">
                {t("undone")}
              </span>
              <Button
                className="h-7 gap-1.5 shadow-none"
                onClick={() => redoApplied(part.toolCallId)}
                size="sm"
                variant="ghost"
              >
                <RotateRight className="size-3.5" />
                {t("applyAgain")}
              </Button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <TickCircle className="size-3.5" />
                {t("applied")}
              </span>
              {outcome === "applied" && (
                <Button
                  className="h-7 gap-1.5 shadow-none"
                  onClick={() => undoApplied(part.toolCallId)}
                  size="sm"
                  variant="ghost"
                >
                  <RotateLeft className="size-3.5" />
                  {t("undo")}
                </Button>
              )}
            </>
          )
        ) : denied ? (
          <span className="text-muted-foreground text-xs">
            {automaticReason ?? t("notAppliedYourEditorIs")}
          </span>
        ) : state === "approval-responded" ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <ModuleOrbit aria-hidden className="size-3.5" />
            {t("applying")}
          </span>
        ) : state === "output-error" ? (
          <span className="text-muted-foreground text-xs">
            {t("couldntApplyItTryAgain")}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("notApplied")}
          </span>
        )}
      </div>
    </div>
  );
}

export function SaveTemplateCard({
  part,
  superseded,
}: {
  part: PartOf<"tool-save_template">;
  superseded: boolean;
}) {
  const t = useTranslations("editor.ai.agentParts");
  const designs = useDesigns();
  const editorStyles = useQREditorStore((state) => state.themeState.styles);
  const editorValue = useQREditorStore((state) => state.value);
  const design = part.input?.design_id
    ? designs.get(part.input.design_id)
    : undefined;
  const output = part.state === "output-available" ? part.output : null;
  const styles = output?.style ?? design?.themeStyles ?? editorStyles;
  const logo: DesignLogo = output?.style
    ? {
        showLogo: Boolean(output.style.showLogo),
        customLogo: output.style.customLogo,
      }
    : (design?.logo ?? {
        showLogo: Boolean(editorStyles.showLogo),
        customLogo: editorStyles.customLogo,
      });
  const name = part.input?.name?.trim() || "AI template";
  const automaticReason =
    "approval" in part && part.approval?.isAutomatic
      ? part.approval.reason
      : null;
  const limitReached =
    (output && !output.ok && output.code === "LIMIT_REACHED") ||
    (automaticReason?.includes("limit") ?? false);

  return (
    <div className="bg-card w-full max-w-[550px] overflow-hidden rounded-lg border">
      <div className="flex gap-3 p-3">
        <DesignPreview
          logo={logo}
          size={72}
          styles={styles}
          value={design?.value ?? (editorValue || CANONICAL_ORIGIN)}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium leading-snug">
            {t("templateName", { name })}
          </p>
          <p className="text-muted-foreground text-xs leading-5">
            {t("savesTheLookToYour")}
          </p>
        </div>
      </div>
      <div className="bg-muted/30 flex min-h-11 items-center justify-between gap-2 border-t px-3 py-1.5">
        {part.state === "approval-requested" &&
        !superseded &&
        !part.approval.isAutomatic ? (
          <>
            <span className="text-muted-foreground text-xs">
              {t("saveToYourAccount")}
            </span>
            <ApprovalButtons
              approvalId={part.approval.id}
              approveLabel="Save"
            />
          </>
        ) : output?.ok ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs">
              <TickCircle className="size-3.5" />
              {t("savedToYourThemes")}
            </span>
            <Button
              asChild
              className="h-7 shadow-none"
              size="sm"
              variant="ghost"
            >
              <Link href={dashboardEntry("themes")}>{t("openThemes")}</Link>
            </Button>
          </>
        ) : limitReached ? (
          <>
            <span className="text-muted-foreground text-xs">
              {automaticReason ?? (output && !output.ok ? output.message : "")}
            </span>
            <Button
              asChild
              className="h-7 shrink-0 shadow-none"
              size="sm"
              variant="outline"
            >
              <Link href="/pricing">{t("upgrade")}</Link>
            </Button>
          </>
        ) : output && !output.ok ? (
          <span className="text-muted-foreground text-xs">
            {output.message}
          </span>
        ) : part.state === "approval-responded" && part.approval.approved ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <ModuleOrbit aria-hidden className="size-3.5" />
            {t("saving")}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">{t("notSaved")}</span>
        )}
      </div>
    </div>
  );
}
