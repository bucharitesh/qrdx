"use client";

import { Info } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TagSelector } from "@/components/tag-selector";
import {
  removedPartsNote,
  toPublishableStyle,
} from "@/lib/community/public-style";
import { GATE_SAMPLES, MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import {
  PublishRefusedError,
  usePublishTheme,
} from "@/lib/hooks/themes/use-community-themes";
import type { ThemeStyles } from "@/types/theme";
import { LicenceConfirm } from "./licence-confirm";

const SAMPLE_NAMES = GATE_SAMPLES.map((sample) => sample.label);
const CHECKS_NOTE = `It must scan Great (${MIN_GATE_SCORE}+) with ${SAMPLE_NAMES.slice(0, -1).join(", ")} and ${SAMPLE_NAMES.at(-1)}. We check when you publish.`;

/**
 * Publishing a saved theme: tags, what isn't shared, the scan check and the
 * CC0 licence. Used by the editor's Publish button and the Themes page.
 */
export function PublishThemeDialog({
  open,
  onOpenChange,
  themeId,
  themeName,
  themeStyle,
  workspaceTheme = false,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themeId: string;
  themeName?: string;
  /** The saved style, to say what won't be shared */
  themeStyle?: ThemeStyles;
  /** A theme of the open workspace: the published copy is credited to you */
  workspaceTheme?: boolean;
  onPublished?: () => void;
}) {
  const t = useTranslations("community.publishThemeDialog");
  const publish = usePublishTheme();
  const [tags, setTags] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const note = themeStyle
    ? removedPartsNote(toPublishableStyle(themeStyle).removed)
    : null;

  useEffect(() => {
    if (!open) {
      setTags([]);
      setAccepted(false);
      setRefusal(null);
    }
  }, [open]);

  const submit = () => {
    setRefusal(null);
    publish.mutate(
      { themeId, tags, acceptLicense: accepted },
      {
        onSuccess: () => {
          onOpenChange(false);
          onPublished?.();
        },
        onError: (error) => {
          if (error instanceof PublishRefusedError) setRefusal(error.message);
        },
      },
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {themeName
              ? t("publishThemenameToTheCommunity", { themeName })
              : t("publishToTheCommunity")}
          </DialogTitle>
          <DialogDescription>
            {t("anyoneCanFindItIn")}
            {workspaceTheme && ` ${t("publishedUnderYourProfile")}`}
          </DialogDescription>
        </DialogHeader>

        <TagSelector
          disabled={publish.isPending}
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
          disabled={publish.isPending}
          onCheckedChange={setAccepted}
        />

        {refusal && (
          <p className="text-destructive text-sm" role="alert">
            {refusal}
          </p>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("cancel")}
          </Button>
          <Button disabled={!accepted || publish.isPending} onClick={submit}>
            {publish.isPending && (
              <ModuleOrbit aria-hidden className="size-4" />
            )}
            {publish.isPending ? t("checkingAndPublishing") : t("publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
