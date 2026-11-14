"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { TickCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PublishDesignDialog } from "@/components/community/publish-design-dialog";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { communityDraft } from "@/lib/community/draft";
import { COMMUNITY_LICENSE_NAME } from "@/lib/community/licence";
import { useChatContext } from "@/lib/hooks/use-chat-context";
import { useQREditorStore } from "@/store/editor-store";
import type { ChatMessage } from "@/types/ai";
import type { ThemeStyles } from "@/types/theme";
import { DesignPreview, useDesigns, useDesignValue } from "./agent-parts";

// The chat's publish_to_community card. The model only drafts: the card
// shows its draft (cleaned like any untrusted text, lib/community/draft.ts)
// and "Edit and publish" opens the publish dialog with it. The person edits,
// ticks CC0 and publishes there; only after that does the card approve the
// tool call, whose result then says what's really in the community.

type Part = ChatMessage["parts"][number];
type PublishPart = Extract<Part, { type: "tool-publish_to_community" }>;

export function PublishToCommunityCard({
  part,
  superseded,
}: {
  part: PublishPart;
  superseded: boolean;
}) {
  const t = useTranslations("editor.ai.publishCard");
  const { addToolApprovalResponse, status } = useChatContext();
  const designs = useDesigns();
  const editorStyles = useQREditorStore((state) => state.themeState.styles);
  const [dialogOpen, setDialogOpen] = useState(false);
  const busy = status === "submitted" || status === "streaming";

  const input = part.input;
  const design = input?.design_id ? designs.get(input.design_id) : undefined;
  const value = useDesignValue(design);
  const draftKey = JSON.stringify([
    input?.name,
    input?.description,
    input?.tags,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the draft's text
  const draft = useMemo(() => communityDraft(input ?? {}), [draftKey]);

  // The design with its logo, as the editor would save it; the server takes
  // out uploaded logos, image art and image fills before publishing.
  const style: ThemeStyles = useMemo(() => {
    if (!design) return editorStyles;
    const logo =
      design.logo === "keep"
        ? {
            showLogo: Boolean(editorStyles.showLogo),
            ...(editorStyles.customLogo
              ? { customLogo: editorStyles.customLogo }
              : {}),
          }
        : design.logo;
    return { ...design.themeStyles, ...logo };
  }, [design, editorStyles]);

  if (input?.design_id && !design) return null;

  const state = part.state;
  const output = state === "output-available" ? part.output : null;
  const automaticReason =
    "approval" in part && part.approval?.isAutomatic
      ? part.approval.reason
      : null;
  const denied =
    state === "output-denied" ||
    (state === "approval-responded" && part.approval?.approved === false);
  const asking =
    state === "approval-requested" && !superseded && !part.approval.isAutomatic;
  const approvalId = "approval" in part ? part.approval?.id : undefined;

  return (
    <div className="bg-card w-full max-w-[550px] overflow-hidden rounded-lg border">
      <div className="flex gap-3 p-3">
        <DesignPreview
          logo={design?.logo ?? "keep"}
          size={72}
          styles={style}
          value={design ? value : value || CANONICAL_ORIGIN}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium leading-snug break-words">
            {t("publishNameToTheCommunity", { name: draft.name })}
          </p>
          {draft.description && (
            <p className="text-muted-foreground text-xs leading-5 break-words">
              {draft.description}
            </p>
          )}
          {draft.tags.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {draft.tags.join(" · ")}
            </p>
          )}
          <p className="text-muted-foreground text-xs leading-5">
            {t("aThemeAnyoneCanUse", { COMMUNITY_LICENSE_NAME })}
          </p>
        </div>
      </div>
      <div className="bg-muted/30 flex min-h-11 flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5">
        {asking && approvalId ? (
          <>
            <span className="text-muted-foreground text-xs">
              {t("shareItInTheCommunity")}
            </span>
            <div className="flex gap-1.5">
              <Button
                className="h-8"
                disabled={busy}
                onClick={() => setDialogOpen(true)}
                size="sm"
              >
                {t("editAndPublish")}
              </Button>
              <Button
                className="h-8 shadow-none"
                disabled={busy}
                onClick={() =>
                  void addToolApprovalResponse({
                    id: approvalId,
                    approved: false,
                  })
                }
                size="sm"
                variant="ghost"
              >
                {t("notNow")}
              </Button>
            </div>
          </>
        ) : output?.ok ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs">
              <TickCircle className="size-3.5" />
              {t("published")}
            </span>
            <Button
              asChild
              className="h-7 shadow-none"
              size="sm"
              variant="ghost"
            >
              <Link href={output.url}>{t("viewIt")}</Link>
            </Button>
          </>
        ) : output && !output.ok ? (
          <span className="text-muted-foreground text-xs">
            {t("notPublishedNothingWasShared")}
          </span>
        ) : denied ? (
          <span className="text-muted-foreground text-xs">
            {automaticReason ?? t("notPublishedNothingWasShared")}
          </span>
        ) : state === "approval-responded" ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <Spinner className="size-3.5" />
            {t("checking")}
          </span>
        ) : state === "output-error" ? (
          <span className="text-muted-foreground text-xs">
            {t("couldntCheckItLookFor")}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("notPublished")}
          </span>
        )}
      </div>

      {approvalId && (
        <PublishDesignDialog
          chatDraftId={part.toolCallId}
          draft={draft}
          onOpenChange={setDialogOpen}
          onPublished={() =>
            void addToolApprovalResponse({ id: approvalId, approved: true })
          }
          open={dialogOpen}
          style={style}
        />
      )}
    </div>
  );
}
