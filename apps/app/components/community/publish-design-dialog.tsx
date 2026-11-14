"use client";

import { Info, Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { publishCommunityDesign } from "@/actions/community";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { TagSelector } from "@/components/tag-selector";
import type { CommunityDraft } from "@/lib/community/draft";
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "@/lib/community/payloads";
import {
  removedPartsNote,
  toPublishableStyle,
} from "@/lib/community/public-style";
import { GATE_SAMPLES, MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { soundEvent } from "@/lib/sound/emit";
import type { ThemeStyles } from "@/types/theme";
import { LicenceConfirm } from "./licence-confirm";

const CHECKS_NOTE = `It must scan Great (${MIN_GATE_SCORE}+) with ${GATE_SAMPLES.map((sample) => sample.label).join(" and ")}. We check when you publish.`;

/**
 * Publish a design that isn't a saved theme (the AI chat's) as a theme:
 * the chat's draft prefills the details, the person edits them, ticks the
 * CC0 box and publishes. Nothing goes out until they press Publish here.
 */
export function PublishDesignDialog({
  open,
  onOpenChange,
  style,
  draft,
  chatDraftId,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The design, logo included (the server strips what isn't shared) */
  style: ThemeStyles;
  draft: CommunityDraft;
  /** The chat tool call this answers, so the chat can confirm the publish */
  chatDraftId?: string;
  onPublished?: (href: string) => void;
}) {
  const t = useTranslations("community.publishDesignDialog");
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [tags, setTags] = useState<string[]>(draft.tags);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<{
    message: string;
    href?: string;
  } | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const note = removedPartsNote(toPublishableStyle(style).removed);

  // Each time it opens, it starts again from the draft.
  useEffect(() => {
    if (open) {
      setName(draft.name);
      setDescription(draft.description);
      setTags(draft.tags);
      setAccepted(false);
      setRefusal(null);
      setPublished(null);
      setPending(false);
    }
  }, [open, draft]);

  const submit = async () => {
    setPending(true);
    setRefusal(null);
    try {
      const result = await publishCommunityDesign({
        style: style as Record<string, unknown>,
        name,
        description,
        tags,
        acceptLicense: accepted,
        ...(chatDraftId ? { chatDraftId } : {}),
      });
      if (result.ok) {
        setPublished(result.data.href);
        soundEvent("success");
        onPublished?.(result.data.href);
      } else {
        setRefusal({ message: result.message, href: result.href });
      }
    } catch {
      setRefusal({ message: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        {published ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tick aria-hidden className="size-5" />
                {t("published")}
              </DialogTitle>
              <DialogDescription>
                {t("valueIsLiveInThe", { value: name.trim() || "Your design" })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                {t("done")}
              </Button>
              <Button asChild>
                <Link href={published}>{t("viewIt")}</Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("publishToTheCommunity")}</DialogTitle>
              <DialogDescription>
                {t("theChatDraftedTheseDetails")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={nameId}>{t("name")}</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {name.length}/{NAME_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  disabled={pending}
                  id={nameId}
                  maxLength={NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={descriptionId}>{t("description")}</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {description.length}/{DESCRIPTION_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  disabled={pending}
                  id={descriptionId}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("optionalWhatItSuits")}
                  rows={3}
                  value={description}
                />
              </div>
              <TagSelector
                disabled={pending}
                onTagsChange={setTags}
                selectedTags={tags}
              />
              <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
                <p className="flex gap-2">
                  <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>{CHECKS_NOTE}</span>
                </p>
                {note && (
                  <p className="flex gap-2">
                    <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>{note}</span>
                  </p>
                )}
              </div>
              <LicenceConfirm
                checked={accepted}
                disabled={pending}
                onCheckedChange={setAccepted}
              />
              {refusal && (
                <p className="text-destructive text-sm" role="alert">
                  {refusal.message}{" "}
                  {refusal.href && (
                    <Link
                      className="underline underline-offset-2"
                      href={refusal.href}
                    >
                      {t("seeIt")}
                    </Link>
                  )}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                {t("cancel")}
              </Button>
              <Button
                disabled={!(accepted && name.trim()) || pending}
                onClick={submit}
              >
                {pending && <Spinner className="size-4" />}
                {pending ? t("checkingAndPublishing") : t("publish")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
