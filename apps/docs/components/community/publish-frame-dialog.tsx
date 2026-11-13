"use client";

import { Info, Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useTranslations } from "next-intl";
import type { QRCustomFrame } from "qrdx";
import { useEffect, useId, useState } from "react";
import {
  publishCommunityFrame,
  publishCommunityThemeFrame,
} from "@/actions/community";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { TagSelector } from "@/components/tag-selector";
import {
  DESCRIPTION_MAX_LENGTH,
  FRAME_TAGS,
  NAME_MAX_LENGTH,
} from "@/lib/community/payloads";
import { GATE_SAMPLES, MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { soundEvent } from "@/lib/sound/emit";
import { LicenceConfirm } from "./licence-confirm";

const CHECKS_NOTE = `On a plain black code it must scan Great (${MIN_GATE_SCORE}+) with ${GATE_SAMPLES.map((sample) => sample.label).join(" and ")}. We check when you publish.`;

/**
 * Publish a custom frame: details, the scan check and CC0. The editor's
 * frame is sent as it is; a saved theme's (`themeId`, the Themes page) is
 * read from the theme on the server, with the theme's access rules.
 */
export function PublishFrameDialog({
  open,
  onOpenChange,
  frame,
  themeId,
  defaultName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frame?: QRCustomFrame;
  themeId?: string;
  defaultName?: string;
}) {
  const t = useTranslations("community.publishFrameDialog");
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<{
    message: string;
    href?: string;
  } | null>(null);
  const [published, setPublished] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName(defaultName);
      setDescription("");
      setTags([]);
      setAccepted(false);
      setRefusal(null);
      setPublished(null);
      setPending(false);
    }
  }, [open, defaultName]);

  const submit = async () => {
    setPending(true);
    setRefusal(null);
    try {
      const details = { name, description, tags, acceptLicense: accepted };
      const result = themeId
        ? await publishCommunityThemeFrame({ themeId, ...details })
        : await publishCommunityFrame({ frame, ...details });
      if (result.ok) {
        setPublished(result.data.href);
        soundEvent("success");
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
      {/* Opened from the editor's Frame panel (z-[120]): a dimmed layer
          and the dialog of its own above it */}
      <DialogPortal>
        <DialogOverlay className="z-[130]" />
      </DialogPortal>
      <DialogContent className="z-[131] sm:max-w-lg">
        {published ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tick aria-hidden className="size-5" />
                {t("published")}
              </DialogTitle>
              <DialogDescription>
                {t("valueIsLiveInThe", { value: name.trim() || "Your frame" })}
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
              <DialogTitle>{t("publishThisFrame")}</DialogTitle>
              <DialogDescription>{t("anyoneCanFindItIn")}</DialogDescription>
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
                  placeholder={t("eGCaféTableCard")}
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
                  placeholder={t("optionalWhatItsFor")}
                  rows={3}
                  value={description}
                />
              </div>
              <TagSelector
                disabled={pending}
                onTagsChange={setTags}
                options={FRAME_TAGS}
                selectedTags={tags}
              />
              <p className="text-muted-foreground flex gap-2 text-xs leading-relaxed">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>{CHECKS_NOTE}</span>
              </p>
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
